import { DatabaseSync } from "node:sqlite";
import { mkdir, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import { UdbxDataSource } from "../dist/index.js";

class NodeSqliteStatement {
  constructor(statement) {
    this.statement = statement;
    this.queryMode = statement.columns().length > 0;
    this.boundParams = undefined;
    this.iterator = null;
    this.currentRow = null;
    this.executed = false;
  }

  async bind(params) {
    this.boundParams = params;
    this.iterator = null;
    this.currentRow = null;
    this.executed = false;
  }

  async step() {
    if (!this.queryMode) {
      if (!this.executed) {
        this.statement.run(...normalizeSqlValues(this.boundParams));
        this.executed = true;
      }
      return false;
    }

    if (!this.iterator) {
      this.iterator = this.statement.iterate(
        ...normalizeSqlValues(this.boundParams)
      );
    }

    const next = this.iterator.next();
    if (next.done) {
      this.currentRow = null;
      return false;
    }

    this.currentRow = next.value;
    return true;
  }

  async getRow() {
    if (!this.currentRow) {
      throw new Error("No current row is available. Call step() first.");
    }
    return this.currentRow;
  }

  async reset() {
    this.iterator = null;
    this.currentRow = null;
    this.executed = false;
  }

  async finalize() {
    this.iterator = null;
    this.currentRow = null;
    this.boundParams = undefined;
  }
}

class NodeSqliteDriver {
  constructor() {
    this.db = null;
    this.transactionDepth = 0;
  }

  async open(target) {
    if (this.db) {
      throw new Error("Database is already open.");
    }

    if (target.kind === "file") {
      this.db = new DatabaseSync(target.path);
      return;
    }
    if (target.kind === "memory") {
      this.db = new DatabaseSync(":memory:");
      return;
    }

    throw new Error(`Node benchmark driver does not support ${target.kind}.`);
  }

  async close() {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.transactionDepth = 0;
    }
  }

  async exec(sql) {
    this.assertOpen().exec(sql);
  }

  async prepare(sql) {
    return new NodeSqliteStatement(this.assertOpen().prepare(sql));
  }

  async transaction(operation) {
    const db = this.assertOpen();
    const nested = this.transactionDepth > 0;
    const savepointName = `udbx_sp_${this.transactionDepth}`;

    db.exec(nested ? `SAVEPOINT ${savepointName}` : "BEGIN");
    this.transactionDepth += 1;

    try {
      const result = await operation();
      this.transactionDepth -= 1;
      db.exec(nested ? `RELEASE SAVEPOINT ${savepointName}` : "COMMIT");
      return result;
    } catch (error) {
      this.transactionDepth -= 1;
      if (nested) {
        db.exec(`ROLLBACK TO SAVEPOINT ${savepointName}`);
        db.exec(`RELEASE SAVEPOINT ${savepointName}`);
      } else {
        db.exec("ROLLBACK");
      }
      throw error;
    }
  }

  assertOpen() {
    if (!this.db) {
      throw new Error("Database is not open.");
    }
    return this.db;
  }
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(__dirname, "../..");
const henanPath = resolve(workspaceRoot, "data/henan.udbx");
const warmupRuns = 1;
const measuredRuns = 5;
const options = parseArgs(process.argv.slice(2));

function normalizeSqlValues(params) {
  if (!params) {
    return [];
  }
  return params.map((value) => {
    if (value instanceof ArrayBuffer) {
      return new Uint8Array(value);
    }
    return value;
  });
}

async function openHenan() {
  return UdbxDataSource.open({
    driver: new NodeSqliteDriver(),
    target: { kind: "file", path: henanPath }
  });
}

async function time(operation) {
  const startedAt = performance.now();
  const value = await operation();
  return { value, elapsedMs: performance.now() - startedAt };
}

async function runOnce() {
  const openResult = await time(openHenan);
  const ds = openResult.value;

  try {
    const getDatasetResult = await time(() => ds.getDataset("weibo"));
    const dataset = getDatasetResult.value;
    if (!dataset) {
      throw new Error("Dataset weibo not found.");
    }

    const countResult = await time(() => dataset.count());
    if (countResult.value !== 469308) {
      throw new Error(`Unexpected count: ${countResult.value}`);
    }

    const firstPage3 = await time(() => dataset.list({ limit: 3, offset: 0 }));
    assertPageLength("first_page_3_ms", firstPage3.value, 3);

    const secondPage3 = await time(() => dataset.list({ limit: 3, offset: 3 }));
    assertPageLength("second_page_3_ms", secondPage3.value, 3);

    const firstPage100 = await time(() =>
      dataset.list({ limit: 100, offset: 0 })
    );
    assertPageLength("first_page_100_ms", firstPage100.value, 100);

    const deepPage100 = await time(() =>
      dataset.list({ limit: 100, offset: 100000 })
    );
    assertPageLength("deep_page_100_ms", deepPage100.value, 100);

    const tenPages100 = await time(async () => {
      let total = 0;
      for (let page = 0; page < 10; page++) {
        const features = await dataset.list({
          limit: 100,
          offset: page * 100
        });
        total += features.length;
      }
      return total;
    });
    if (tenPages100.value !== 1000) {
      throw new Error(`Unexpected ten-page total: ${tenPages100.value}`);
    }

    return {
      open_data_source_ms: openResult.elapsedMs,
      get_dataset_ms: getDatasetResult.elapsedMs,
      count_ms: countResult.elapsedMs,
      first_page_3_ms: firstPage3.elapsedMs,
      second_page_3_ms: secondPage3.elapsedMs,
      first_page_100_ms: firstPage100.elapsedMs,
      deep_page_100_ms: deepPage100.elapsedMs,
      ten_pages_100_ms: tenPages100.elapsedMs
    };
  } finally {
    await ds.close();
  }
}

function assertPageLength(metric, features, expected) {
  if (features.length !== expected) {
    throw new Error(`${metric} returned ${features.length}, expected ${expected}.`);
  }
}

function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    runs: values,
    minMs: sorted[0],
    medianMs: sorted[Math.floor(sorted.length / 2)],
    maxMs: sorted[sorted.length - 1]
  };
}

function toFixed(value) {
  return value.toFixed(3);
}

function parseArgs(args) {
  const parsed = { jsonOut: null };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--json-out") {
      const value = args[i + 1];
      if (!value) {
        throw new Error("--json-out requires a file path.");
      }
      parsed.jsonOut = value;
      i++;
      continue;
    }

    if (arg?.startsWith("--json-out=")) {
      parsed.jsonOut = arg.slice("--json-out=".length);
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return parsed;
}

const samples = [];
for (let run = 0; run < warmupRuns + measuredRuns; run++) {
  const result = await runOnce();
  if (run >= warmupRuns) {
    samples.push(result);
  }
}

const metrics = Object.keys(samples[0]);
const results = metrics.map((metric) => ({
  sdk: "udbx4ts",
  metric,
  ...summarize(samples.map((sample) => sample[metric]))
}));

const payload = {
  date: new Date().toISOString(),
  sample: {
    path: "data/henan.udbx",
    sha256:
      "e5f75d3b0d0334c778a2145f49836271664bd62cf354394fedb47c0ee7665356",
    dataset: "weibo",
    tableName: "henan_P",
    objectCount: 469308
  },
  environment: {
    os: `${os.type()} ${os.release()} ${os.arch()}`,
    cpu: os.cpus()[0]?.model ?? "",
    memoryBytes: os.totalmem(),
    node: process.version
  },
  warmupRuns,
  measuredRuns,
  results
};

console.log("| SDK | 指标 | min ms | median ms | max ms |");
console.log("|---|---|---:|---:|---:|");
for (const result of results) {
  console.log(
    `| \`${result.sdk}\` | \`${result.metric}\` | ${toFixed(result.minMs)} | ${toFixed(result.medianMs)} | ${toFixed(result.maxMs)} |`
  );
}

console.log("\n```json");
console.log(JSON.stringify(payload, null, 2));
console.log("```");

if (options.jsonOut) {
  const outputPath = resolve(process.cwd(), options.jsonOut);
  const tmpPath = `${outputPath}.tmp`;
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(tmpPath, `${JSON.stringify(payload, null, 2)}\n`);
  await rename(tmpPath, outputPath);
  console.log(`\nJSON written to ${outputPath}`);
}

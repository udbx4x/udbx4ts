import { describe, expect, it } from "vitest";

import { BrowserSqliteDriver } from "../../src/runtime-browser/sqlite/BrowserSqliteDriver";
import { createSqliteWasmAdapter } from "../../src/runtime-browser/sqlite/createSqliteWasmAdapter";

class FakeStatement {
  private rowIndex = 0;
  boundParams: readonly unknown[] = [];
  finalized = false;

  constructor(private readonly rows: readonly Record<string, unknown>[]) {}

  bind(binding: readonly unknown[]): FakeStatement {
    this.boundParams = binding;
    return this;
  }

  step(): boolean {
    if (this.rowIndex >= this.rows.length) {
      return false;
    }

    this.rowIndex += 1;
    return true;
  }

  get<T>(target: T): T {
    if (typeof target === "object" && target !== null && !Array.isArray(target)) {
      return { ...this.rows[this.rowIndex - 1] } as T;
    }
    return target;
  }

  reset(): FakeStatement {
    this.rowIndex = 0;
    return this;
  }

  finalize(): number {
    this.finalized = true;
    return 0;
  }
}

interface OpenRecord {
  readonly kind: "db" | "opfs";
  readonly filename: string;
  readonly flags: string | undefined;
  readonly vfs: string | undefined;
}

class FakeDb {
  static opens: OpenRecord[] = [];
  readonly prepared: FakeStatement[] = [];
  readonly executed: string[] = [];
  closed = false;

  constructor(
    filename = ":memory:",
    flags?: string,
    vfs?: string
  ) {
    FakeDb.opens.push({
      kind: "db",
      filename,
      flags,
      vfs
    });
  }

  exec(sql: string): void {
    this.executed.push(sql);
  }

  prepare(sql: string): FakeStatement {
    const rows =
      sql.toLowerCase().includes("select")
        ? [{ ID: 1, NAME: "Shanghai" }]
        : [];
    const statement = new FakeStatement(rows);
    this.prepared.push(statement);
    return statement;
  }

  close(): void {
    this.closed = true;
  }
}

class FakeOpfsDb extends FakeDb {
  static imported: { filename: string; bytes: Uint8Array } | null = null;

  constructor(filename: string, flags?: string) {
    super(filename, flags, "opfs");
    FakeDb.opens[FakeDb.opens.length - 1] = {
      kind: "opfs",
      filename,
      flags,
      vfs: "opfs"
    };
  }

  static async importDb(filename: string, data: Uint8Array | ArrayBuffer): Promise<number> {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    FakeOpfsDb.imported = { filename, bytes };
    return 0;
  }
}

describe("createSqliteWasmAdapter", () => {
  it("opens OPFS target with OpfsDb when available", async () => {
    FakeDb.opens = [];

    const adapter = createSqliteWasmAdapter({
      initSqlite3: async () =>
        ({
          oo1: {
            DB: FakeDb,
            OpfsDb: FakeOpfsDb
          },
          capi: {
            sqlite3_js_db_export: () => new Uint8Array([0x55, 0x44, 0x42, 0x58])
          }
        }) as never
    });

    const connection = await adapter.open({
      kind: "opfs",
      path: "workspace/data.udbx"
    });
    connection.close();

    expect(FakeDb.opens[0]).toEqual({
      kind: "opfs",
      filename: "workspace/data.udbx",
      flags: "c",
      vfs: "opfs"
    });
  });

  it("throws when OPFS target is requested but OpfsDb is unavailable", async () => {
    const adapter = createSqliteWasmAdapter({
      initSqlite3: async () =>
        ({
          oo1: {
            DB: FakeDb
          },
          capi: {
            sqlite3_js_db_export: () => new Uint8Array([0x55, 0x44, 0x42, 0x58])
          }
        }) as never
    });

    await expect(
      adapter.open({
        kind: "opfs",
        path: "workspace/data.udbx"
      })
    ).rejects.toThrow("OPFS VFS is unavailable");
  });

  it("executes SQL and reads rows through BrowserSqliteDriver", async () => {
    const adapter = createSqliteWasmAdapter({
      initSqlite3: async () =>
        ({
          oo1: {
            DB: FakeDb,
            OpfsDb: FakeOpfsDb
          },
          capi: {
            sqlite3_js_db_export: () => new Uint8Array([0x55, 0x44, 0x42, 0x58])
          }
        }) as never
    });
    const driver = new BrowserSqliteDriver(adapter);

    await driver.open({ kind: "memory", name: "ignored" });
    await driver.exec("CREATE TABLE demo(id INTEGER)");

    const statement = await driver.prepare("SELECT 1 AS ID, 'Shanghai' AS NAME");
    await statement.bind([1]);
    const hasRow = await statement.step();
    const row = await statement.getRow<Record<string, unknown>>();
    await statement.finalize();
    await driver.close();

    expect(hasRow).toBe(true);
    expect(row).toMatchObject({ ID: 1, NAME: "Shanghai" });
  });

  it("exports binary through BrowserSqliteDriver", async () => {
    const adapter = createSqliteWasmAdapter({
      initSqlite3: async () =>
        ({
          oo1: {
            DB: FakeDb
          },
          capi: {
            sqlite3_js_db_export: () => new Uint8Array([1, 2, 3, 4])
          }
        }) as never
    });
    const driver = new BrowserSqliteDriver(adapter);

    await driver.open({ kind: "memory" });
    const binary = await driver.exportDatabase();
    await driver.close();

    expect(Array.from(binary)).toEqual([1, 2, 3, 4]);
  });

  it("imports OPFS database bytes through BrowserSqliteDriver", async () => {
    FakeOpfsDb.imported = null;

    const adapter = createSqliteWasmAdapter({
      initSqlite3: async () =>
        ({
          oo1: {
            DB: FakeDb,
            OpfsDb: FakeOpfsDb
          },
          capi: {
            sqlite3_js_db_export: () => new Uint8Array([1])
          }
        }) as never
    });
    const driver = new BrowserSqliteDriver(adapter);

    await driver.importDatabase(
      { kind: "opfs", path: "workspace/import.udbx" },
      new Uint8Array([7, 8, 9])
    );

    expect(FakeOpfsDb.imported).not.toBeNull();
    const imported = FakeOpfsDb.imported as
      | { filename: string; bytes: Uint8Array }
      | null;
    if (!imported) {
      throw new Error("Expected imported bytes record.");
    }
    expect(imported.filename).toBe("workspace/import.udbx");
    expect(Array.from(imported.bytes)).toEqual([7, 8, 9]);
  });
});

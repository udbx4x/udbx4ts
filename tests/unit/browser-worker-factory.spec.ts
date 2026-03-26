import { describe, expect, it } from "vitest";

import type {
  SqlDriver,
  SqlOpenTarget,
  SqlStatement,
  SqlValue
} from "../../src/core/sql/SqlDriver";
import { RPC_METHODS } from "../../src/shared-runtime/rpc/methods";
import type { RuntimeRequest } from "../../src/shared-runtime/rpc/protocol";
import { createBrowserWorkerRuntime } from "../../src/runtime-browser/worker/createBrowserWorkerRuntime";

class FakeStatement implements SqlStatement {
  constructor(private readonly hasRow: boolean) {}

  async bind(_params?: readonly SqlValue[]): Promise<void> {}
  async step(): Promise<boolean> {
    return this.hasRow;
  }
  async getRow<T>(): Promise<T> {
    throw new Error("No row.");
  }
  async reset(): Promise<void> {}
  async finalize(): Promise<void> {}
}

class FakeDriver implements SqlDriver {
  openTarget: SqlOpenTarget | null = null;
  initialized = false;
  importedBinary: Uint8Array | null = null;

  async open(target: SqlOpenTarget): Promise<void> {
    this.openTarget = target;
  }

  async close(): Promise<void> {}

  async exec(sql: string): Promise<void> {
    if (sql.includes("CREATE TABLE SmDataSourceInfo")) {
      this.initialized = true;
    }
  }

  async prepare(sql: string): Promise<SqlStatement> {
    if (sql.includes("FROM sqlite_master")) {
      return new FakeStatement(this.initialized);
    }

    return new FakeStatement(false);
  }

  async transaction<T>(operation: () => Promise<T>): Promise<T> {
    return operation();
  }

  async importDatabase(_target: SqlOpenTarget, binary: Uint8Array): Promise<void> {
    this.importedBinary = binary;
    this.initialized = true;
  }
}

async function callOpen(runtime: ReturnType<typeof createBrowserWorkerRuntime>, preferOpfs: boolean) {
  const request: RuntimeRequest = {
    id: "open-id",
    method: RPC_METHODS.udbxOpen,
    params: { preferOpfs }
  };

  return runtime.handle(request);
}

describe("createBrowserWorkerRuntime", () => {
  it("falls back to memory when OPFS is unavailable", async () => {
    const driver = new FakeDriver();
    const runtime = createBrowserWorkerRuntime({
      createDriver: () => driver,
      openTarget: {
        memoryName: "fallback-memory",
        capabilities: { hasOpfs: false }
      }
    });

    const response = await callOpen(runtime, true);

    expect(response).toMatchObject({ ok: true });
    expect(driver.openTarget).toEqual({
      kind: "memory",
      name: "fallback-memory"
    });
  });

  it("uses opfs target when OPFS is available", async () => {
    const driver = new FakeDriver();
    const runtime = createBrowserWorkerRuntime({
      createDriver: () => driver,
      openTarget: {
        opfsPath: "workspace/project.udbx",
        capabilities: { hasOpfs: true }
      }
    });

    const response = await callOpen(runtime, true);

    expect(response).toMatchObject({ ok: true });
    expect(driver.openTarget).toEqual({
      kind: "opfs",
      path: "workspace/project.udbx"
    });
  });

  it("imports bytes through replaceDataSource when import RPC is called", async () => {
    const driver = new FakeDriver();
    const runtime = createBrowserWorkerRuntime({
      createDriver: () => driver,
      openTarget: {
        opfsPath: "workspace/project.udbx",
        capabilities: { hasOpfs: false }
      }
    });

    await runtime.handle({
      id: "open-id",
      method: RPC_METHODS.udbxOpen,
      params: { preferOpfs: false }
    });
    const response = await runtime.handle({
      id: "import-id",
      method: RPC_METHODS.udbxImportDatabase,
      params: { binary: new Uint8Array([4, 5, 6]), preferOpfs: false }
    });

    expect(response).toMatchObject({ ok: true });
    expect(driver.importedBinary).toBeInstanceOf(Uint8Array);
    expect(Array.from(driver.importedBinary ?? [])).toEqual([4, 5, 6]);
  });
});

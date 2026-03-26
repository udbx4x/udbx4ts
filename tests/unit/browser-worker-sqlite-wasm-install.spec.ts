import { describe, expect, it } from "vitest";

import { RPC_METHODS } from "../../src/shared-runtime/rpc/methods";
import { installSqliteWasmWorkerRuntime } from "../../src/runtime-browser/worker/installSqliteWasmWorkerRuntime";

class FakeStatement {
  bind(_binding: readonly unknown[]): FakeStatement {
    return this;
  }

  step(): boolean {
    return true;
  }

  get<T>(target: T): T {
    if (typeof target === "object" && target !== null && !Array.isArray(target)) {
      return { name: "SmDataSourceInfo" } as T;
    }
    return target;
  }

  reset(): FakeStatement {
    return this;
  }

  finalize(): number {
    return 0;
  }
}

class FakeDb {
  constructor(_filename?: string, _flags?: string, _vfs?: string) {}
  exec(_sql: string): void {}
  prepare(_sql: string): FakeStatement {
    return new FakeStatement();
  }
  close(): void {}
}

interface MessageListener {
  (event: { data: unknown }): void;
}

class MockWorkerGlobal {
  listener: MessageListener | null = null;
  readonly messages: unknown[] = [];

  addEventListener(_type: "message", listener: MessageListener): void {
    this.listener = listener;
  }

  postMessage(message: unknown): void {
    this.messages.push(message);
  }
}

describe("installSqliteWasmWorkerRuntime", () => {
  it("installs runtime and serves open/export RPC", async () => {
    const scope = new MockWorkerGlobal();

    installSqliteWasmWorkerRuntime(scope, {
      sqlite: {
        initSqlite3: async () =>
          ({
            oo1: {
              DB: FakeDb
            },
            capi: {
              sqlite3_js_db_export: () => new Uint8Array([9, 8, 7])
            }
          }) as never
      },
      openTarget: {
        memoryName: "worker-test-memory"
      }
    });

    scope.listener?.({
      data: {
        id: "open-1",
        method: RPC_METHODS.udbxOpen,
        params: { preferOpfs: false }
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    scope.listener?.({
      data: {
        id: "export-1",
        method: RPC_METHODS.udbxExportDatabase
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(scope.messages).toHaveLength(2);
    const open = scope.messages.find(
      (item) => (item as { id?: string }).id === "open-1"
    );
    const exported = scope.messages.find(
      (item) => (item as { id?: string }).id === "export-1"
    );

    expect(open).toMatchObject({
      id: "open-1",
      ok: true,
      result: { runtime: "browser" }
    });
    expect(exported).toMatchObject({
      id: "export-1",
      ok: true
    });
    expect(Array.from((exported as { result: Uint8Array }).result)).toEqual([
      9, 8, 7
    ]);
  });
});

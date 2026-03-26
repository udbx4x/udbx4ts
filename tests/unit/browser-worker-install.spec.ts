import { describe, expect, it } from "vitest";

import type {
  SqlDriver,
  SqlOpenTarget,
  SqlStatement,
  SqlValue
} from "../../src/core/sql/SqlDriver";
import { RPC_METHODS } from "../../src/shared-runtime/rpc/methods";
import { installDefaultBrowserWorkerRuntime } from "../../src/runtime-browser/worker";

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
  async open(_target: SqlOpenTarget): Promise<void> {}
  async close(): Promise<void> {}
  async exec(_sql: string): Promise<void> {}
  async prepare(sql: string): Promise<SqlStatement> {
    if (sql.includes("FROM sqlite_master")) {
      return new FakeStatement(false);
    }
    return new FakeStatement(false);
  }
  async transaction<T>(operation: () => Promise<T>): Promise<T> {
    return operation();
  }
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

describe("installDefaultBrowserWorkerRuntime", () => {
  it("registers message handler and returns RPC responses", async () => {
    const globalScope = new MockWorkerGlobal();
    installDefaultBrowserWorkerRuntime(globalScope, {
      createDriver: () => new FakeDriver(),
      openTarget: { capabilities: { hasOpfs: false } }
    });

    expect(globalScope.listener).not.toBeNull();

    globalScope.listener?.({
      data: {
        id: "open-1",
        method: RPC_METHODS.udbxOpen,
        params: { preferOpfs: true }
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(globalScope.messages).toHaveLength(1);
    expect(globalScope.messages[0]).toMatchObject({
      id: "open-1",
      ok: true,
      result: { runtime: "browser" }
    });
  });
});

import { describe, expect, it } from "vitest";

import {
  UDBX_SCHEMA_STATEMENTS,
  UDBX_SYSTEM_TABLES,
  UdbxSchemaInitializer
} from "../../src/core/schema/UdbxSchemaInitializer";
import type { SqlDriver, SqlOpenTarget, SqlStatement } from "../../src/core/sql/SqlDriver";

class RecordingStatement implements SqlStatement {
  constructor(private readonly hasRow: boolean) {}

  async bind(): Promise<void> {}
  async step(): Promise<boolean> {
    return this.hasRow;
  }
  async getRow<T>(): Promise<T> {
    throw new Error("Not implemented in test.");
  }
  async reset(): Promise<void> {}
  async finalize(): Promise<void> {}
}

class RecordingDriver implements SqlDriver {
  readonly execCalls: string[] = [];
  readonly preparedSql: string[] = [];
  transactionCount = 0;
  hasSmDataSourceInfo = false;

  async open(_target: SqlOpenTarget): Promise<void> {}
  async close(): Promise<void> {}
  async exec(sql: string): Promise<void> {
    this.execCalls.push(sql);
  }
  async prepare(sql: string): Promise<SqlStatement> {
    this.preparedSql.push(sql);
    return new RecordingStatement(this.hasSmDataSourceInfo);
  }
  async transaction<T>(operation: () => Promise<T>): Promise<T> {
    this.transactionCount += 1;
    return operation();
  }
}

describe("UdbxSchemaInitializer", () => {
  it("defines the expected minimum system tables", () => {
    expect(UDBX_SYSTEM_TABLES).toEqual([
      "spatial_ref_sys",
      "geometry_columns",
      "SmDataSourceInfo",
      "SmRegister",
      "SmFieldInfo"
    ]);
  });

  it("executes all schema statements within one transaction", async () => {
    const driver = new RecordingDriver();

    await UdbxSchemaInitializer.initialize(driver);

    expect(driver.transactionCount).toBe(1);
    expect(driver.execCalls).toHaveLength(UDBX_SCHEMA_STATEMENTS.length + 1);
    expect(driver.execCalls[0]).toContain("PRAGMA journal_mode = WAL");
    expect(driver.execCalls.some((sql) => sql.includes("CREATE TABLE SmRegister"))).toBe(true);
    expect(driver.execCalls.some((sql) => sql.includes("INSERT INTO spatial_ref_sys"))).toBe(true);
  });

  it("ensureInitialized initializes only when schema is missing", async () => {
    const driver = new RecordingDriver();

    const created = await UdbxSchemaInitializer.ensureInitialized(driver);
    expect(created).toBe(true);
    expect(driver.transactionCount).toBe(1);

    driver.execCalls.length = 0;
    driver.transactionCount = 0;
    driver.hasSmDataSourceInfo = true;

    const skipped = await UdbxSchemaInitializer.ensureInitialized(driver);
    expect(skipped).toBe(false);
    expect(driver.transactionCount).toBe(0);
    expect(driver.execCalls).toHaveLength(0);
    expect(
      driver.preparedSql.some((sql) => sql.includes("FROM sqlite_master"))
    ).toBe(true);
  });
});

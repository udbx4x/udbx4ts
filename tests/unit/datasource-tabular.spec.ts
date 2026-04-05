import { describe, expect, it } from "vitest";

import { TabularDataset, UdbxDataSource } from "../../src/index";
import type { SqlDriver, SqlOpenTarget, SqlStatement, SqlValue } from "../../src/core/sql/SqlDriver";

class MockStatement implements SqlStatement {
  private index = -1;
  readonly boundParams: Array<readonly SqlValue[] | undefined> = [];

  constructor(private readonly rows: readonly unknown[] = []) {}

  async bind(params?: readonly SqlValue[]): Promise<void> {
    this.boundParams.push(params);
  }

  async step(): Promise<boolean> {
    this.index += 1;
    return this.index < this.rows.length;
  }

  async getRow<T>(): Promise<T> {
    return this.rows[this.index] as T;
  }

  async reset(): Promise<void> {
    this.index = -1;
  }

  async finalize(): Promise<void> {}
}

class MockDriver implements SqlDriver {
  readonly openTargets: SqlOpenTarget[] = [];
  readonly execCalls: string[] = [];
  readonly preparedSql: string[] = [];
  closeCount = 0;
  transactionCount = 0;

  constructor(private readonly statements: MockStatement[] = []) {}

  async open(target: SqlOpenTarget): Promise<void> {
    this.openTargets.push(target);
  }

  async close(): Promise<void> {
    this.closeCount += 1;
  }

  async exec(sql: string): Promise<void> {
    this.execCalls.push(sql);
  }

  async prepare(sql: string): Promise<SqlStatement> {
    this.preparedSql.push(sql);
    const statement = this.statements.shift();
    if (!statement) {
      throw new Error(`No mock statement available for SQL: ${sql}`);
    }
    return statement;
  }

  async transaction<T>(operation: () => Promise<T>): Promise<T> {
    this.transactionCount += 1;
    return operation();
  }
}

describe("UdbxDataSource tabular support", () => {
  it("returns a TabularDataset for tabular dataset metadata", async () => {
    const driver = new MockDriver([
      new MockStatement([
        {
          SmDatasetID: 3,
          SmDatasetName: "Cities",
          SmTableName: "Cities",
          SmDatasetType: 0,
          SmObjectCount: 5,
          SmSRID: 0
        }
      ])
    ]);
    const ds = new UdbxDataSource(driver);

    const dataset = await ds.getDataset("Cities");

    expect(dataset).toBeInstanceOf(TabularDataset);
    expect(dataset?.info.name).toBe("Cities");
    expect(dataset?.info.kind).toBe("tabular");
  });

  it("creates a tabular dataset and registers metadata", async () => {
    const nextId = new MockStatement([{ nextId: 1 }]);
    const insertRegister = new MockStatement([]);
    const insertFieldInfo1 = new MockStatement([]);
    const insertFieldInfo2 = new MockStatement([]);
    const driver = new MockDriver([
      nextId,
      insertRegister,
      insertFieldInfo1,
      insertFieldInfo2
    ]);

    const ds = new UdbxDataSource(driver);
    const dataset = await ds.createTabularDataset("Cities", [
      { name: "NAME", fieldType: "text", nullable: false },
      { name: "POPULATION", fieldType: "int32", nullable: true }
    ]);

    expect(driver.transactionCount).toBe(1);
    expect(driver.execCalls[0]).toContain('CREATE TABLE "Cities"');
    expect(driver.execCalls[0]).not.toContain("SmGeometry");
    expect(dataset.info).toEqual({
      id: 1,
      name: "Cities",
      kind: "tabular",
      tableName: "Cities",
      srid: 0,
      objectCount: 0,
      geometryType: null
    });
  });

  it("creates a tabular dataset without fields", async () => {
    const nextId = new MockStatement([{ nextId: 1 }]);
    const insertRegister = new MockStatement([]);
    const driver = new MockDriver([nextId, insertRegister]);

    const ds = new UdbxDataSource(driver);
    const dataset = await ds.createTabularDataset("SimpleTable");

    expect(driver.execCalls[0]).toContain("SmID");
    expect(driver.execCalls[0]).toContain("SmUserID");
    expect(dataset.info.kind).toBe("tabular");
  });
});

describe("TabularDataset", () => {
  it("loads a record by id", async () => {
    const driver = new MockDriver([
      new MockStatement([
        {
          SmID: 1,
          SmUserID: 0,
          NAME: "Beijing",
          POPULATION: 21540000
        }
      ])
    ]);
    const dataset = new TabularDataset(driver, {
      id: 1,
      name: "Cities",
      kind: "tabular",
      tableName: "Cities",
      srid: 0,
      objectCount: 1,
      geometryType: null
    });

    const record = await dataset.getById(1);

    expect(record).toEqual({
      id: 1,
      attributes: {
        NAME: "Beijing",
        POPULATION: 21540000
      }
    });
  });

  it("lists records with filters", async () => {
    const driver = new MockDriver([
      new MockStatement([
        {
          SmID: 1,
          SmUserID: 0,
          NAME: "Beijing"
        },
        {
          SmID: 2,
          SmUserID: 0,
          NAME: "Shanghai"
        }
      ])
    ]);
    const dataset = new TabularDataset(driver, {
      id: 1,
      name: "Cities",
      kind: "tabular",
      tableName: "Cities",
      srid: 0,
      objectCount: 2,
      geometryType: null
    });

    const records = await dataset.list({ ids: [1, 2], limit: 10 });

    expect(records).toHaveLength(2);
    expect(records[0]!.attributes.NAME).toBe("Beijing");
    expect(records[1]!.attributes.NAME).toBe("Shanghai");
    expect(driver.preparedSql[0]).toContain("WHERE SmID IN (?, ?)");
    expect(driver.preparedSql[0]).toContain("LIMIT ?");
  });

  it("inserts a record and updates the register counters", async () => {
    const fieldsStatement = new MockStatement([
      {
        SmFieldName: "NAME",
        SmFieldType: 128,
        SmFieldbRequired: 0,
        SmFieldDefaultValue: null
      }
    ]);
    const insertRecord = new MockStatement([]);
    const updateRegister = new MockStatement([]);
    const driver = new MockDriver([
      fieldsStatement,
      insertRecord,
      updateRegister
    ]);
    const dataset = new TabularDataset(driver, {
      id: 3,
      name: "Cities",
      kind: "tabular",
      tableName: "Cities",
      srid: 0,
      objectCount: 0,
      geometryType: null
    });

    await dataset.insert({
      id: 10,
      attributes: { NAME: "Guangzhou" }
    });

    expect(driver.transactionCount).toBe(1);
    expect(insertRecord.boundParams[0]?.[0]).toBe(10);
    expect(insertRecord.boundParams[0]?.[1]).toBe(0);
    expect(insertRecord.boundParams[0]?.[2]).toBe("Guangzhou");
    expect(updateRegister.boundParams[0]).toEqual([3]);
  });

  it("updates a record", async () => {
    const fieldsStatement = new MockStatement([
      { SmFieldName: "NAME", SmFieldType: 128, SmFieldbRequired: 0, SmFieldDefaultValue: null },
      { SmFieldName: "POPULATION", SmFieldType: 4, SmFieldbRequired: 0, SmFieldDefaultValue: null }
    ]);
    const updateStatement = new MockStatement([]);
    const driver = new MockDriver([fieldsStatement, updateStatement]);
    const dataset = new TabularDataset(driver, {
      id: 1,
      name: "Cities",
      kind: "tabular",
      tableName: "Cities",
      srid: 0,
      objectCount: 1,
      geometryType: null
    });

    await dataset.update(1, { NAME: "Beijing Updated", POPULATION: 22000000 });

    expect(updateStatement.boundParams[0]).toEqual([
      "Beijing Updated",
      22000000,
      1
    ]);
    expect(driver.preparedSql[1]).toContain("UPDATE");
    expect(driver.preparedSql[1]).toContain('"NAME" = ?');
    expect(driver.preparedSql[1]).toContain('"POPULATION" = ?');
  });

  it("deletes a record", async () => {
    const deleteStatement = new MockStatement([]);
    const decrementRegister = new MockStatement([]);
    const driver = new MockDriver([deleteStatement, decrementRegister]);
    const dataset = new TabularDataset(driver, {
      id: 1,
      name: "Cities",
      kind: "tabular",
      tableName: "Cities",
      srid: 0,
      objectCount: 1,
      geometryType: null
    });

    await dataset.delete(1);

    expect(driver.transactionCount).toBe(1);
    expect(deleteStatement.boundParams[0]).toEqual([1]);
    expect(driver.preparedSql[0]).toContain("DELETE FROM");
  });
});

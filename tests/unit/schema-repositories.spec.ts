import { describe, expect, it } from "vitest";

import type { SqlDriver, SqlOpenTarget, SqlStatement, SqlValue } from "../../src/core/sql/SqlDriver";
import { SmFieldInfoRepository } from "../../src/core/schema/SmFieldInfoRepository";
import { SmRegisterRepository } from "../../src/core/schema/SmRegisterRepository";
import { datasetKindToValue, datasetValueToKind, fieldTypeToValue, fieldValueToType } from "../../src/core/schema/UdbxTypeMappings";

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
  readonly preparedSql: string[] = [];
  readonly statements: MockStatement[];

  constructor(statements: MockStatement[]) {
    this.statements = statements;
  }

  async open(_target: SqlOpenTarget): Promise<void> {}
  async close(): Promise<void> {}
  async exec(_sql: string): Promise<void> {}

  async prepare(sql: string): Promise<SqlStatement> {
    this.preparedSql.push(sql);
    const statement = this.statements.shift();
    if (!statement) {
      throw new Error(`No mock statement available for SQL: ${sql}`);
    }
    return statement;
  }

  async transaction<T>(operation: () => Promise<T>): Promise<T> {
    return operation();
  }
}

describe("type mappings", () => {
  it("maps supported dataset kinds to SmDatasetType values", () => {
    expect(datasetKindToValue("point")).toBe(1);
    expect(datasetValueToKind(105)).toBe("regionZ");
  });

  it("maps supported field types to SmFieldType values", () => {
    expect(fieldTypeToValue("double")).toBe(7);
    expect(fieldValueToType(127)).toBe("ntext");
  });
});

describe("SmRegisterRepository", () => {
  it("maps query results into DatasetInfo objects", async () => {
    const driver = new MockDriver([
      new MockStatement([
        {
          SmDatasetID: 1,
          SmDatasetName: "BaseMap_P",
          SmTableName: "BaseMap_P",
          SmDatasetType: 1,
          SmObjectCount: 100,
          SmSRID: 4326
        }
      ])
    ]);

    const repository = new SmRegisterRepository(driver);
    const datasets = await repository.findAll();

    expect(datasets).toEqual([
      {
        id: 1,
        name: "BaseMap_P",
        kind: "point",
        tableName: "BaseMap_P",
        srid: 4326,
        objectCount: 100,
        geometryType: null
      }
    ]);
  });

  it("inserts a dataset using parameterized SQL", async () => {
    const nextIdStatement = new MockStatement([{ nextId: 3 }]);
    const insertStatement = new MockStatement([]);
    const driver = new MockDriver([nextIdStatement, insertStatement]);

    const repository = new SmRegisterRepository(driver);
    const datasetId = await repository.insert({
      name: "Roads",
      kind: "line",
      srid: 4326,
      idColumnName: "SmID",
      geometryColumnName: "SmGeometry"
    });

    expect(datasetId).toBe(3);
    expect(insertStatement.boundParams[0]).toEqual([
      3,
      "Roads",
      "Roads",
      3,
      4326,
      "SmID",
      "SmGeometry"
    ]);
  });
});

describe("SmFieldInfoRepository", () => {
  it("maps rows into FieldInfo objects", async () => {
    const driver = new MockDriver([
      new MockStatement([
        {
          SmFieldName: "NAME",
          SmFieldType: 128,
          SmFieldbRequired: 0,
          SmFieldDefaultValue: null
        }
      ])
    ]);

    const repository = new SmFieldInfoRepository(driver);
    const fields = await repository.findByDatasetId(1);

    expect(fields).toEqual([
      {
        name: "NAME",
        fieldType: "text",
        nullable: true,
        defaultValue: undefined
      }
    ]);
  });

  it("inserts all fields using parameterized SQL", async () => {
    const insertStatement = new MockStatement([]);
    const driver = new MockDriver([insertStatement]);
    const repository = new SmFieldInfoRepository(driver);

    await repository.insertAll(5, [
      {
        name: "ELEVATION",
        fieldType: "double",
        nullable: false,
        defaultValue: 0
      }
    ]);

    expect(insertStatement.boundParams[0]).toEqual([
      5,
      "ELEVATION",
      7,
      "ELEVATION",
      1,
      "0"
    ]);
  });
});


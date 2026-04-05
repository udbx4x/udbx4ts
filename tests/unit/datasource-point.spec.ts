import { describe, expect, it } from "vitest";

import { PointDataset, UdbxDataSource } from "../../src/index";
import { GaiaPointCodec } from "../../src/core/geometry/gaia/GaiaPointCodec";
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

describe("UdbxDataSource", () => {
  it("opens through the provided driver", async () => {
    const driver = new MockDriver();
    const ds = await UdbxDataSource.open({
      driver,
      target: { kind: "memory", name: "test" }
    });

    expect(driver.openTargets).toEqual([{ kind: "memory", name: "test" }]);
    expect(ds.runtime).toBe("unknown");
  });

  it("lists datasets from SmRegister", async () => {
    const driver = new MockDriver([
      new MockStatement([
        {
          SmDatasetID: 1,
          SmDatasetName: "BaseMap_P",
          SmTableName: "BaseMap_P",
          SmDatasetType: 1,
          SmObjectCount: 10,
          SmSRID: 4326
        }
      ])
    ]);
    const ds = new UdbxDataSource(driver);

    await expect(ds.listDatasets()).resolves.toEqual([
      {
        id: 1,
        name: "BaseMap_P",
        kind: "point",
        tableName: "BaseMap_P",
        srid: 4326,
        objectCount: 10,
        geometryType: null
      }
    ]);
  });

  it("returns a PointDataset for point dataset metadata", async () => {
    const driver = new MockDriver([
      new MockStatement([
        {
          SmDatasetID: 1,
          SmDatasetName: "BaseMap_P",
          SmTableName: "BaseMap_P",
          SmDatasetType: 1,
          SmObjectCount: 10,
          SmSRID: 4326
        }
      ])
    ]);
    const ds = new UdbxDataSource(driver);

    const dataset = await ds.getDataset("BaseMap_P");

    expect(dataset).toBeInstanceOf(PointDataset);
    expect(dataset?.info.name).toBe("BaseMap_P");
  });

  it("creates a point dataset and registers metadata", async () => {
    const nextId = new MockStatement([{ nextId: 2 }]);
    const insertRegister = new MockStatement([]);
    const insertGeometryColumns = new MockStatement([]);
    const insertFieldInfo = new MockStatement([]);
    const driver = new MockDriver([
      nextId,
      insertRegister,
      insertGeometryColumns,
      insertFieldInfo
    ]);
    const ds = new UdbxDataSource(driver);

    const dataset = await ds.createPointDataset("Cities", 4326, [
      {
        name: "NAME",
        fieldType: "text",
        nullable: false
      }
    ]);

    expect(driver.transactionCount).toBe(1);
    expect(driver.execCalls[0]).toContain('CREATE TABLE "Cities"');
    expect(insertGeometryColumns.boundParams[0]).toEqual([
      "Cities",
      "SmGeometry",
      1,
      2,
      4326,
      0
    ]);
    expect(insertFieldInfo.boundParams[0]).toEqual([
      2,
      "NAME",
      128,
      "NAME",
      1,
      null
    ]);
    expect(dataset.info).toEqual({
      id: 2,
      name: "Cities",
      kind: "point",
      tableName: "Cities",
      srid: 4326,
      objectCount: 0,
      geometryType: 1
    });
  });
});

describe("PointDataset", () => {
  it("loads a point feature by id", async () => {
    const blob = GaiaPointCodec.writePoint(
      { type: "Point", coordinates: [116.123, 39.456] },
      4326
    );
    const driver = new MockDriver([
      new MockStatement([
        {
          SmID: 7,
          SmGeometry: blob,
          NAME: "Beijing"
        }
      ])
    ]);
    const dataset = new PointDataset(driver, {
      id: 1,
      name: "BaseMap_P",
      kind: "point",
      tableName: "BaseMap_P",
      srid: 4326,
      objectCount: 1,
      geometryType: 1
    });

    const feature = await dataset.getById(7);

    expect(feature).toEqual({
      id: 7,
      geometry: {
        type: "Point",
        coordinates: [116.123, 39.456],
        srid: 4326,
        bbox: [116.123, 39.456, 116.123, 39.456],
        hasZ: false,
        geoType: 1
      },
      attributes: {
        NAME: "Beijing"
      }
    });
  });

  it("builds list queries with filters", async () => {
    const blob = GaiaPointCodec.writePoint(
      { type: "Point", coordinates: [116.123, 39.456] },
      4326
    );
    const driver = new MockDriver([
      new MockStatement([
        {
          SmID: 7,
          SmGeometry: blob,
          NAME: "Beijing"
        }
      ])
    ]);
    const dataset = new PointDataset(driver, {
      id: 1,
      name: "BaseMap_P",
      kind: "point",
      tableName: "BaseMap_P",
      srid: 4326,
      objectCount: 1,
      geometryType: 1
    });

    const rows = await dataset.list({ ids: [7], limit: 10, offset: 5 });

    expect(rows).toHaveLength(1);
    expect(driver.preparedSql[0]).toContain('WHERE SmID IN (?)');
    expect(driver.preparedSql[0]).toContain("LIMIT ?");
    expect(driver.preparedSql[0]).toContain("OFFSET ?");
  });

  it("inserts a point feature and updates the register counters", async () => {
    const fieldsStatement = new MockStatement([
      {
        SmFieldName: "NAME",
        SmFieldType: 128,
        SmFieldbRequired: 0,
        SmFieldDefaultValue: null
      }
    ]);
    const insertFeature = new MockStatement([]);
    const updateRegister = new MockStatement([]);
    const driver = new MockDriver([
      fieldsStatement,
      insertFeature,
      updateRegister
    ]);
    const dataset = new PointDataset(driver, {
      id: 5,
      name: "Cities",
      kind: "point",
      tableName: "Cities",
      srid: 4326,
      objectCount: 0,
      geometryType: 1
    });

    await dataset.insert({
      id: 1,
      geometry: {
        type: "Point",
        coordinates: [116.123, 39.456]
      },
      attributes: {
        NAME: "Beijing"
      }
    });

    expect(driver.transactionCount).toBe(1);
    expect(insertFeature.boundParams[0]?.[0]).toBe(1);
    expect(insertFeature.boundParams[0]?.[1]).toBe(0);
    expect(insertFeature.boundParams[0]?.[3]).toBe("Beijing");
    expect(updateRegister.boundParams[0]).toEqual([60, 60, 5]);
  });
});


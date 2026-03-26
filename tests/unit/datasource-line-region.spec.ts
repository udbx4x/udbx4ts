import { describe, expect, it } from "vitest";

import {
  GaiaLineCodec,
  GaiaPolygonCodec,
  LineDataset,
  RegionDataset,
  UdbxDataSource
} from "../../src/index";
import type {
  SqlDriver,
  SqlOpenTarget,
  SqlStatement,
  SqlValue
} from "../../src/core/sql/SqlDriver";

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
  readonly execCalls: string[] = [];
  readonly preparedSql: string[] = [];
  transactionCount = 0;

  constructor(private readonly statements: MockStatement[] = []) {}

  async open(_target: SqlOpenTarget): Promise<void> {}
  async close(): Promise<void> {}
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

describe("UdbxDataSource dataset dispatch", () => {
  it("returns a LineDataset for line metadata", async () => {
    const driver = new MockDriver([
      new MockStatement([
        {
          SmDatasetID: 2,
          SmDatasetName: "Roads",
          SmTableName: "Roads",
          SmDatasetType: 3,
          SmObjectCount: 5,
          SmSRID: 4326
        }
      ])
    ]);
    const ds = new UdbxDataSource(driver);

    const dataset = await ds.getDataset("Roads");

    expect(dataset).toBeInstanceOf(LineDataset);
  });

  it("returns a RegionDataset for region metadata", async () => {
    const driver = new MockDriver([
      new MockStatement([
        {
          SmDatasetID: 3,
          SmDatasetName: "Parcels",
          SmTableName: "Parcels",
          SmDatasetType: 5,
          SmObjectCount: 6,
          SmSRID: 4326
        }
      ])
    ]);
    const ds = new UdbxDataSource(driver);

    const dataset = await ds.getDataset("Parcels");

    expect(dataset).toBeInstanceOf(RegionDataset);
  });
});

describe("LineDataset", () => {
  it("loads a line feature by id", async () => {
    const blob = GaiaLineCodec.writeMultiLineString(
      {
        type: "MultiLineString",
        coordinates: [
          [
            [116.123, 39.456],
            [117, 40]
          ]
        ]
      },
      4326
    );
    const driver = new MockDriver([
      new MockStatement([
        {
          SmID: 9,
          SmGeometry: blob,
          NAME: "RingRoad"
        }
      ])
    ]);
    const dataset = new LineDataset(driver, {
      id: 2,
      name: "Roads",
      kind: "line",
      tableName: "Roads",
      srid: 4326,
      objectCount: 1,
      geometryType: 5
    });

    const feature = await dataset.getById(9);

    expect(feature?.geometry.type).toBe("MultiLineString");
    expect(feature?.attributes).toEqual({ NAME: "RingRoad" });
  });

  it("creates a line dataset and registers geometry columns", async () => {
    const nextId = new MockStatement([{ nextId: 4 }]);
    const insertRegister = new MockStatement([]);
    const insertGeometryColumns = new MockStatement([]);
    const driver = new MockDriver([nextId, insertRegister, insertGeometryColumns]);
    const ds = new UdbxDataSource(driver);

    const dataset = await ds.createLineDataset("Roads", 4326);

    expect(driver.transactionCount).toBe(1);
    expect(insertGeometryColumns.boundParams[0]).toEqual([
      "Roads",
      "SmGeometry",
      5,
      2,
      4326,
      0
    ]);
    expect(dataset.info.kind).toBe("line");
  });
});

describe("RegionDataset", () => {
  it("loads a region feature by id", async () => {
    const blob = GaiaPolygonCodec.writeMultiPolygon(
      {
        type: "MultiPolygon",
        coordinates: [
          [
            [
              [116.123, 39.456],
              [117, 39.456],
              [117, 40],
              [116.123, 40],
              [116.123, 39.456]
            ]
          ]
        ]
      },
      4326
    );
    const driver = new MockDriver([
      new MockStatement([
        {
          SmID: 10,
          SmGeometry: blob,
          NAME: "ParcelA"
        }
      ])
    ]);
    const dataset = new RegionDataset(driver, {
      id: 3,
      name: "Parcels",
      kind: "region",
      tableName: "Parcels",
      srid: 4326,
      objectCount: 1,
      geometryType: 6
    });

    const feature = await dataset.getById(10);

    expect(feature?.geometry.type).toBe("MultiPolygon");
    expect(feature?.attributes).toEqual({ NAME: "ParcelA" });
  });

  it("creates a region dataset and registers geometry columns", async () => {
    const nextId = new MockStatement([{ nextId: 5 }]);
    const insertRegister = new MockStatement([]);
    const insertGeometryColumns = new MockStatement([]);
    const driver = new MockDriver([nextId, insertRegister, insertGeometryColumns]);
    const ds = new UdbxDataSource(driver);

    const dataset = await ds.createRegionDataset("Parcels", 4326);

    expect(driver.transactionCount).toBe(1);
    expect(insertGeometryColumns.boundParams[0]).toEqual([
      "Parcels",
      "SmGeometry",
      6,
      2,
      4326,
      0
    ]);
    expect(dataset.info.kind).toBe("region");
  });
});


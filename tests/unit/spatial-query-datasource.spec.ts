import { describe, expect, it } from "vitest";

import { UdbxDataSource } from "../../src/core/datasource/UdbxDataSource";
import { UdbxNotFoundError } from "../../src/core/errors";
import { GaiaGeometryCodec } from "../../src/core/geometry/gaia/GaiaGeometryCodec";
import { executeSql } from "../../src/core/sql/SqlHelpers";
import type { SqlDriver } from "../../src/core/sql/SqlDriver";
import type { PointDataset } from "../../src/core/dataset/PointDataset";
import { NodeSqliteDriver } from "../support/NodeSqliteDriver";

interface Fixture {
  readonly driver: SqlDriver;
  readonly ds: UdbxDataSource;
}

async function makeFixture(withRTree: boolean): Promise<Fixture> {
  const driver = new NodeSqliteDriver();
  const ds = await UdbxDataSource.create({
    driver,
    target: { kind: "memory" },
    runtime: "unknown"
  });
  await ds.createPointDataset("Points", 4326);
  if (withRTree) {
    await driver.exec(
      `CREATE VIRTUAL TABLE "idx_Points_SmGeometry" USING rtree(pkid, xmin, xmax, ymin, ymax)`
    );
    await executeSql(
      driver,
      `UPDATE geometry_columns SET spatial_index_enabled = 1 WHERE f_table_name = ?`,
      ["Points"]
    );
  }
  return { driver, ds };
}

async function insertPointRaw(
  driver: SqlDriver,
  id: number,
  x: number,
  y: number
): Promise<void> {
  const blob = GaiaGeometryCodec.encode(
    { type: "Point", coordinates: [x, y] },
    4326
  );
  await executeSql(
    driver,
    `INSERT INTO "Points" (SmID, SmUserID, SmGeometry) VALUES (?, ?, ?)`,
    [id, 0, blob]
  );
}

async function insertPointViaDataset(
  dataset: PointDataset,
  id: number,
  x: number,
  y: number
): Promise<void> {
  await dataset.insert({
    id,
    geometry: { type: "Point", coordinates: [x, y], srid: 4326 },
    attributes: {}
  });
}

describe("UdbxDataSource.querySpatial", () => {
  it("returns RTree results through the public API", async () => {
    const { driver, ds } = await makeFixture(true);
    await insertPointRaw(driver, 1, 1, 1);
    await insertPointRaw(driver, 2, 10, 10);
    await executeSql(
      driver,
      `INSERT INTO "idx_Points_SmGeometry" (pkid, xmin, xmax, ymin, ymax) VALUES (?, ?, ?, ?, ?)`,
      [1, 1, 1, 1, 1]
    );
    await executeSql(
      driver,
      `INSERT INTO "idx_Points_SmGeometry" (pkid, xmin, xmax, ymin, ymax) VALUES (?, ?, ?, ?, ?)`,
      [2, 10, 10, 10, 10]
    );

    const result = await ds.querySpatial("Points", {
      bounds: { minX: 0, minY: 0, maxX: 5, maxY: 5 },
      limit: 10
    });

    expect(result.strategy).toBe("rtree");
    expect(result.features.map((f) => f.id)).toEqual([1]);
  });

  it("rejects unknown datasets with not found", async () => {
    const { ds } = await makeFixture(false);
    await expect(
      ds.querySpatial("Missing", {
        bounds: { minX: 0, minY: 0, maxX: 5, maxY: 5 },
        limit: 10
      })
    ).rejects.toBeInstanceOf(UdbxNotFoundError);
  });

  it("invalidates the envelope cache after dataset insert", async () => {
    const { driver, ds } = await makeFixture(false);
    await insertPointRaw(driver, 1, 1, 1);

    const first = await ds.querySpatial("Points", {
      bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 },
      limit: 10
    });
    expect(first.features.map((f) => f.id)).toEqual([1]);

    const dataset = (await ds.getDataset("Points")) as PointDataset;
    await insertPointViaDataset(dataset, 2, 5, 5);

    const second = await ds.querySpatial("Points", {
      bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 },
      limit: 10
    });
    expect(second.features.map((f) => f.id)).toEqual([1, 2]);
  });

  it("invalidates the envelope cache after dataset delete", async () => {
    const { driver, ds } = await makeFixture(false);
    await insertPointRaw(driver, 1, 1, 1);
    await insertPointRaw(driver, 2, 5, 5);

    const before = await ds.querySpatial("Points", {
      bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 },
      limit: 10
    });
    expect(before.features.map((f) => f.id)).toEqual([1, 2]);

    const dataset = (await ds.getDataset("Points")) as PointDataset;
    await dataset.delete(1);

    const after = await ds.querySpatial("Points", {
      bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 },
      limit: 10
    });
    expect(after.features.map((f) => f.id)).toEqual([2]);
  });
});

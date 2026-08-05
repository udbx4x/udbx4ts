import { describe, expect, it } from "vitest";

import { UdbxDataSource } from "../../src/core/datasource/UdbxDataSource";
import { GaiaGeometryCodec } from "../../src/core/geometry/gaia/GaiaGeometryCodec";
import { SmRegisterRepository } from "../../src/core/schema/SmRegisterRepository";
import { SpatialQuerier } from "../../src/core/spatial/SpatialQuerier";
import { executeSql } from "../../src/core/sql/SqlHelpers";
import type { SqlDriver } from "../../src/core/sql/SqlDriver";
import type { DatasetInfo } from "../../src/core/types";
import { NodeSqliteDriver } from "../support/NodeSqliteDriver";

interface PointFixture {
  readonly id: number;
  readonly x: number;
  readonly y: number;
}

async function makePointRTreeFixture(
  points: readonly PointFixture[]
): Promise<{ driver: SqlDriver; info: DatasetInfo; querier: SpatialQuerier }> {
  const driver = new NodeSqliteDriver();
  const ds = await UdbxDataSource.create({
    driver,
    target: { kind: "memory" },
    runtime: "unknown"
  });
  await ds.createPointDataset("Points", 4326);
  await driver.exec(
    `CREATE VIRTUAL TABLE "idx_Points_SmGeometry" USING rtree(pkid, xmin, xmax, ymin, ymax)`
  );
  await executeSql(
    driver,
    `UPDATE geometry_columns SET spatial_index_enabled = 1 WHERE f_table_name = ?`,
    ["Points"]
  );

  for (const point of points) {
    const blob = GaiaGeometryCodec.encode(
      { type: "Point", coordinates: [point.x, point.y] },
      4326
    );
    await executeSql(
      driver,
      `INSERT INTO "Points" (SmID, SmUserID, SmGeometry) VALUES (?, ?, ?)`,
      [point.id, 0, blob]
    );
    await executeSql(
      driver,
      `INSERT INTO "idx_Points_SmGeometry" (pkid, xmin, xmax, ymin, ymax)
       VALUES (?, ?, ?, ?, ?)`,
      [point.id, point.x, point.x, point.y, point.y]
    );
  }

  const register = new SmRegisterRepository(driver);
  const info = await register.findByName("Points");
  if (!info) {
    throw new Error("Points dataset missing");
  }
  return { driver, info, querier: new SpatialQuerier(driver) };
}

describe("spatial query RTree path", () => {
  it("returns viewport-matching features in stable SmID order", async () => {
    const { querier, info } = await makePointRTreeFixture([
      { id: 1, x: 1, y: 1 },
      { id: 2, x: 2, y: 2 },
      { id: 3, x: 10, y: 10 }
    ]);

    const result = await querier.query(info, {
      bounds: { minX: 0, minY: 0, maxX: 5, maxY: 5 },
      limit: 10
    });

    expect(result.strategy).toBe("rtree");
    expect(result.hasMore).toBe(false);
    expect(result.features.map((f) => f.id)).toEqual([1, 2]);
    expect(result.features[0]?.geometry.type).toBe("Point");
    expect(result.queriedBounds).toEqual({ minX: 0, minY: 0, maxX: 5, maxY: 5 });
  });

  it("treats MBR boundary contact as intersecting", async () => {
    const { querier, info } = await makePointRTreeFixture([
      { id: 1, x: 5, y: 5 },
      { id: 2, x: 6, y: 6 }
    ]);

    const result = await querier.query(info, {
      bounds: { minX: 0, minY: 0, maxX: 5, maxY: 5 },
      limit: 10
    });

    expect(result.features.map((f) => f.id)).toEqual([1]);
  });

  it("reports hasMore when matches exceed limit", async () => {
    const { querier, info } = await makePointRTreeFixture([
      { id: 1, x: 1, y: 1 },
      { id: 2, x: 2, y: 2 },
      { id: 3, x: 3, y: 3 }
    ]);

    const result = await querier.query(info, {
      bounds: { minX: 0, minY: 0, maxX: 5, maxY: 5 },
      limit: 2
    });

    expect(result.features.map((f) => f.id)).toEqual([1, 2]);
    expect(result.hasMore).toBe(true);
  });

  it("appends offscreen required IDs after candidates and dedupes", async () => {
    const { querier, info } = await makePointRTreeFixture([
      { id: 1, x: 1, y: 1 },
      { id: 2, x: 2, y: 2 },
      { id: 3, x: 50, y: 50 }
    ]);

    const result = await querier.query(info, {
      bounds: { minX: 0, minY: 0, maxX: 5, maxY: 5 },
      limit: 10,
      requiredIds: [3, 1]
    });

    expect(result.features.map((f) => f.id)).toEqual([1, 2, 3]);
  });

  it("rejects invalid viewport bounds", async () => {
    const { querier, info } = await makePointRTreeFixture([
      { id: 1, x: 1, y: 1 }
    ]);

    await expect(
      querier.query(info, {
        bounds: { minX: 5, minY: 0, maxX: 0, maxY: 5 },
        limit: 10
      })
    ).rejects.toMatchObject({ reason: "invalid_viewport" });

    await expect(
      querier.query(info, {
        bounds: { minX: Number.NaN, minY: 0, maxX: 1, maxY: 1 },
        limit: 10
      })
    ).rejects.toMatchObject({ reason: "invalid_viewport" });
  });

  it("rejects unsupported dataset kinds", async () => {
    const driver = new NodeSqliteDriver();
    const ds = await UdbxDataSource.create({
      driver,
      target: { kind: "memory" },
      runtime: "unknown"
    });
    await ds.createTabularDataset("T1");
    const register = new SmRegisterRepository(driver);
    const info = await register.findByName("T1");
    if (!info) {
      throw new Error("T1 dataset missing");
    }

    await expect(
      new SpatialQuerier(driver).query(info, {
        bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
        limit: 10
      })
    ).rejects.toMatchObject({ reason: "unsupported_dataset_kind" });
  });
});

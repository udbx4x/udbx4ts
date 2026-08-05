import { describe, expect, it } from "vitest";

import { UdbxDataSource } from "../../src/core/datasource/UdbxDataSource";
import { SpatialQueryError, UdbxError } from "../../src/core/errors";
import { GaiaGeometryCodec } from "../../src/core/geometry/gaia/GaiaGeometryCodec";
import { SmRegisterRepository } from "../../src/core/schema/SmRegisterRepository";
import { SpatialQuerier } from "../../src/core/spatial/SpatialQuerier";
import { executeSql } from "../../src/core/sql/SqlHelpers";
import type { SqlDriver } from "../../src/core/sql/SqlDriver";
import type { DatasetInfo } from "../../src/core/types";
import { NodeSqliteDriver } from "../support/NodeSqliteDriver";

async function makePointFixture(
  withRTree: boolean
): Promise<{ driver: SqlDriver; info: DatasetInfo; querier: SpatialQuerier }> {
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
  const blob = GaiaGeometryCodec.encode(
    { type: "Point", coordinates: [1, 1] },
    4326
  );
  await executeSql(
    driver,
    `INSERT INTO "Points" (SmID, SmUserID, SmGeometry) VALUES (?, ?, ?)`,
    [1, 0, blob]
  );
  const register = new SmRegisterRepository(driver);
  const info = await register.findByName("Points");
  if (!info) {
    throw new Error("Points dataset missing");
  }
  return { driver, info, querier: new SpatialQuerier(driver) };
}

describe("spatial query error semantics", () => {
  it("rejects non-positive or non-integer limits", async () => {
    const { info, querier } = await makePointFixture(true);
    for (const limit of [0, -1, 1.5]) {
      await expect(
        querier.query(info, {
          bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
          limit
        })
      ).rejects.toMatchObject({ reason: "invalid_viewport" });
    }
  });

  it("rejects invalid requiredIds", async () => {
    const { info, querier } = await makePointFixture(true);
    for (const requiredIds of [[0], [-1], [1, 1], [1.5]]) {
      await expect(
        querier.query(info, {
          bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
          limit: 10,
          requiredIds
        })
      ).rejects.toMatchObject({ reason: "invalid_viewport" });
    }
  });

  it("fails with query_timeout for pre-aborted signals", async () => {
    const { info, querier } = await makePointFixture(true);
    const controller = new AbortController();
    controller.abort();

    await expect(
      querier.query(info, {
        bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
        limit: 10,
        signal: controller.signal
      })
    ).rejects.toMatchObject({ reason: "query_timeout" });
  });

  it("fails with query_timeout on the envelope path for aborted signals", async () => {
    const { info, querier } = await makePointFixture(false);
    const controller = new AbortController();
    controller.abort();

    await expect(
      querier.query(info, {
        bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
        limit: 10,
        signal: controller.signal
      })
    ).rejects.toMatchObject({ reason: "query_timeout" });
  });

  it("throws SpatialQueryError instances that extend UdbxError", async () => {
    const { info, querier } = await makePointFixture(true);
    try {
      await querier.query(info, {
        bounds: { minX: 5, minY: 0, maxX: 0, maxY: 5 },
        limit: 10
      });
      expect.unreachable("expected invalid viewport error");
    } catch (error) {
      expect(error).toBeInstanceOf(SpatialQueryError);
      expect(error).toBeInstanceOf(UdbxError);
      expect((error as SpatialQueryError).reason).toBe("invalid_viewport");
    }
  });
});

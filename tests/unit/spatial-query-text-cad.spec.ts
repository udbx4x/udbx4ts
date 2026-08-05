import { describe, expect, it } from "vitest";

import { UdbxDataSource } from "../../src/core/datasource/UdbxDataSource";
import { CadGeometryCodec } from "../../src/core/geometry/cad/CadGeometryCodec";
import {
  encodeGaiaEnvelopeHeader,
  type GaiaEnvelope
} from "../../src/core/geometry/gaia/GaiaEnvelope";
import { GeoTextCodec } from "../../src/core/geometry/geotext/GeoTextCodec";
import { SmRegisterRepository } from "../../src/core/schema/SmRegisterRepository";
import { SpatialQuerier } from "../../src/core/spatial/SpatialQuerier";
import { executeSql } from "../../src/core/sql/SqlHelpers";
import type { SqlDriver } from "../../src/core/sql/SqlDriver";
import type { DatasetInfo, TextGeometry } from "../../src/core/types";
import { NodeSqliteDriver } from "../support/NodeSqliteDriver";

interface TextRow {
  readonly id: number;
  readonly text: string;
  readonly envelope: GaiaEnvelope;
  readonly payload?: boolean;
  readonly indexKey?: boolean;
}

async function makeTextFixture(
  withRTree: boolean
): Promise<{ driver: SqlDriver; info: DatasetInfo; querier: SpatialQuerier }> {
  const driver = new NodeSqliteDriver();
  const ds = await UdbxDataSource.create({
    driver,
    target: { kind: "memory" },
    runtime: "unknown"
  });
  await ds.createTextDataset("Labels", 4326);
  if (withRTree) {
    await driver.exec(
      `CREATE VIRTUAL TABLE "idx_Labels_SmIndexKey" USING rtree(pkid, xmin, xmax, ymin, ymax)`
    );
    await executeSql(
      driver,
      `UPDATE geometry_columns SET spatial_index_enabled = 1 WHERE f_table_name = ?`,
      ["Labels"]
    );
  }
  const register = new SmRegisterRepository(driver);
  const info = await register.findByName("Labels");
  if (!info) {
    throw new Error("Labels dataset missing");
  }
  return { driver, info, querier: new SpatialQuerier(driver) };
}

async function insertTextRows(
  driver: SqlDriver,
  rows: readonly TextRow[]
): Promise<void> {
  for (const row of rows) {
    const payload = row.payload === false
      ? null
      : GeoTextCodec.encode({
          type: "Text",
          text: row.text,
          anchor: [row.envelope.minX, row.envelope.minY]
        });
    const indexKey =
      row.indexKey === false
        ? null
        : encodeGaiaEnvelopeHeader(row.envelope, 4326, 3);
    await executeSql(
      driver,
      `INSERT INTO "Labels" (SmID, SmUserID, SmGeometry, SmIndexKey) VALUES (?, ?, ?, ?)`,
      [row.id, 0, payload, indexKey]
    );
  }
}

describe("spatial query Text dataset", () => {
  it("decodes GeoText payloads through the envelope cache path", async () => {
    const { driver, info, querier } = await makeTextFixture(false);
    await insertTextRows(driver, [
      { id: 1, text: "inside", envelope: { minX: 0, minY: 0, maxX: 10, maxY: 10 } },
      { id: 2, text: "outside", envelope: { minX: 100, minY: 100, maxX: 110, maxY: 110 } }
    ]);

    const result = await querier.query(info, {
      bounds: { minX: 0, minY: 0, maxX: 5, maxY: 5 },
      limit: 10
    });

    expect(result.strategy).toBe("envelope_cache");
    expect(result.features.map((f) => f.id)).toEqual([1]);
    expect((result.features[0]?.geometry as TextGeometry).text).toBe("inside");
    expect((result.features[0]?.geometry as TextGeometry).type).toBe("Text");
  });

  it("decodes GeoText payloads through the RTree path", async () => {
    const { driver, info, querier } = await makeTextFixture(true);
    await insertTextRows(driver, [
      { id: 1, text: "inside", envelope: { minX: 0, minY: 0, maxX: 10, maxY: 10 } },
      { id: 2, text: "outside", envelope: { minX: 100, minY: 100, maxX: 110, maxY: 110 } }
    ]);
    await executeSql(
      driver,
      `INSERT INTO "idx_Labels_SmIndexKey" (pkid, xmin, xmax, ymin, ymax) VALUES (?, ?, ?, ?, ?)`,
      [1, 0, 10, 0, 10]
    );
    await executeSql(
      driver,
      `INSERT INTO "idx_Labels_SmIndexKey" (pkid, xmin, xmax, ymin, ymax) VALUES (?, ?, ?, ?, ?)`,
      [2, 100, 110, 100, 110]
    );

    const result = await querier.query(info, {
      bounds: { minX: 0, minY: 0, maxX: 5, maxY: 5 },
      limit: 10
    });

    expect(result.strategy).toBe("rtree");
    expect(result.features.map((f) => f.id)).toEqual([1]);
    expect((result.features[0]?.geometry as TextGeometry).text).toBe("inside");
  });

  it("skips double-null rows and rejects inconsistent rows", async () => {
    const { driver, info, querier } = await makeTextFixture(false);
    await insertTextRows(driver, [
      { id: 1, text: "ok", envelope: { minX: 0, minY: 0, maxX: 10, maxY: 10 } },
      { id: 3, text: "skip", envelope: { minX: 0, minY: 0, maxX: 1, maxY: 1 }, payload: false, indexKey: false }
    ]);

    const result = await querier.query(info, {
      bounds: { minX: 0, minY: 0, maxX: 20, maxY: 20 },
      limit: 10
    });
    expect(result.features.map((f) => f.id)).toEqual([1]);

    const missingIndex = await makeTextFixture(false);
    await insertTextRows(missingIndex.driver, [
      { id: 1, text: "orphan", envelope: { minX: 0, minY: 0, maxX: 1, maxY: 1 }, indexKey: false }
    ]);
    await expect(
      missingIndex.querier.query(missingIndex.info, {
        bounds: { minX: 0, minY: 0, maxX: 20, maxY: 20 },
        limit: 10
      })
    ).rejects.toMatchObject({ reason: "spatial_index_unavailable" });

    const missingPayload = await makeTextFixture(false);
    await insertTextRows(missingPayload.driver, [
      { id: 1, text: "orphan", envelope: { minX: 0, minY: 0, maxX: 1, maxY: 1 }, payload: false }
    ]);
    await expect(
      missingPayload.querier.query(missingPayload.info, {
        bounds: { minX: 0, minY: 0, maxX: 20, maxY: 20 },
        limit: 10
      })
    ).rejects.toMatchObject({ reason: "corrupt_geometry" });
  });
});

interface CadRow {
  readonly id: number;
  readonly envelope: GaiaEnvelope;
}

async function makeCadFixture(
  withRTree: boolean
): Promise<{ driver: SqlDriver; info: DatasetInfo; querier: SpatialQuerier }> {
  const driver = new NodeSqliteDriver();
  const ds = await UdbxDataSource.create({
    driver,
    target: { kind: "memory" },
    runtime: "unknown"
  });
  await ds.createCadDataset("CADDT");
  await driver.exec(`ALTER TABLE "CADDT" ADD COLUMN "SmIndexKey" POLYGON`);
  await driver.exec(`ALTER TABLE "CADDT" ADD COLUMN "SmGeoType" INTEGER`);
  await executeSql(
    driver,
    `INSERT INTO geometry_columns (
       f_table_name, f_geometry_column, geometry_type,
       coord_dimension, srid, spatial_index_enabled
     ) VALUES (?, ?, ?, ?, ?, ?)`,
    ["CADDT", "SmIndexKey", 3, 2, 0, withRTree ? 1 : 0]
  );
  if (withRTree) {
    await driver.exec(
      `CREATE VIRTUAL TABLE "idx_CADDT_SmIndexKey" USING rtree(pkid, xmin, xmax, ymin, ymax)`
    );
  }
  const register = new SmRegisterRepository(driver);
  const info = await register.findByName("CADDT");
  if (!info) {
    throw new Error("CADDT dataset missing");
  }
  return { driver, info, querier: new SpatialQuerier(driver) };
}

async function insertCadRows(
  driver: SqlDriver,
  rows: readonly CadRow[]
): Promise<void> {
  for (const row of rows) {
    const geometry = CadGeometryCodec.write({
      type: "CadPoint",
      x: row.envelope.minX,
      y: row.envelope.minY
    });
    const indexKey = encodeGaiaEnvelopeHeader(row.envelope, 0, 3);
    await executeSql(
      driver,
      `INSERT INTO "CADDT" (SmID, SmUserID, SmGeometry, SmIndexKey, SmGeoType) VALUES (?, ?, ?, ?, ?)`,
      [row.id, 0, geometry, indexKey, 1]
    );
  }
}

describe("spatial query CAD dataset", () => {
  it("decodes CAD payloads through the envelope cache path", async () => {
    const { driver, info, querier } = await makeCadFixture(false);
    await insertCadRows(driver, [
      { id: 1, envelope: { minX: 0, minY: 0, maxX: 10, maxY: 10 } },
      { id: 2, envelope: { minX: 100, minY: 100, maxX: 110, maxY: 110 } }
    ]);

    const result = await querier.query(info, {
      bounds: { minX: 0, minY: 0, maxX: 5, maxY: 5 },
      limit: 10
    });

    expect(result.strategy).toBe("envelope_cache");
    expect(result.features.map((f) => f.id)).toEqual([1]);
    expect(result.features[0]?.geometry.type).toBe("CadPoint");
    expect(result.features[0]?.attributes.SmGeoType).toBe(1);
  });

  it("decodes CAD payloads through the RTree path", async () => {
    const { driver, info, querier } = await makeCadFixture(true);
    await insertCadRows(driver, [
      { id: 1, envelope: { minX: 0, minY: 0, maxX: 10, maxY: 10 } }
    ]);
    await executeSql(
      driver,
      `INSERT INTO "idx_CADDT_SmIndexKey" (pkid, xmin, xmax, ymin, ymax) VALUES (?, ?, ?, ?, ?)`,
      [1, 0, 10, 0, 10]
    );

    const result = await querier.query(info, {
      bounds: { minX: 0, minY: 0, maxX: 5, maxY: 5 },
      limit: 10
    });

    expect(result.strategy).toBe("rtree");
    expect(result.features.map((f) => f.id)).toEqual([1]);
    expect(result.features[0]?.geometry.type).toBe("CadPoint");
  });
});

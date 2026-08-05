import { describe, expect, it } from "vitest";

import { UdbxDataSource } from "../../src/core/datasource/UdbxDataSource";
import type { SmRegisterSpatialMetadata } from "../../src/core/schema/SmRegisterRepository";
import { SmRegisterRepository } from "../../src/core/schema/SmRegisterRepository";
import {
  detectSpatialCapability,
  type SpatialCapabilityResult
} from "../../src/core/spatial/spatialCapability";
import { executeSql } from "../../src/core/sql/SqlHelpers";
import type { SqlDriver } from "../../src/core/sql/SqlDriver";
import type { DatasetInfo } from "../../src/core/types";
import { NodeSqliteDriver } from "../support/NodeSqliteDriver";

interface Fixture {
  readonly driver: SqlDriver;
  readonly ds: UdbxDataSource;
  readonly register: SmRegisterRepository;
}

async function makeFixture(): Promise<Fixture> {
  const driver = new NodeSqliteDriver();
  const ds = await UdbxDataSource.create({
    driver,
    target: { kind: "memory" },
    runtime: "unknown"
  });
  const register = new SmRegisterRepository(driver);
  return { driver, ds, register };
}

async function detect(
  fixture: Fixture,
  name: string
): Promise<SpatialCapabilityResult> {
  const info = await fixture.register.findByName(name);
  expect(info).not.toBeNull();
  const meta = await fixture.register.findSpatialMetadata(name);
  expect(meta).not.toBeNull();
  return detectSpatialCapability(
    fixture.driver,
    info as DatasetInfo,
    meta as SmRegisterSpatialMetadata
  );
}

async function addRTree(
  fixture: Fixture,
  rtreeName: string,
  tableName: string
): Promise<void> {
  await fixture.driver.exec(
    `CREATE VIRTUAL TABLE ${rtreeName} USING rtree(pkid, xmin, xmax, ymin, ymax)`
  );
  await executeSql(
    fixture.driver,
    `UPDATE geometry_columns SET spatial_index_enabled = 1 WHERE f_table_name = ?`,
    [tableName]
  );
}

describe("spatial capability detection", () => {
  it("detects RTree capability for a point dataset", async () => {
    const fixture = await makeFixture();
    await fixture.ds.createPointDataset("Points", 4326);
    await addRTree(
      fixture,
      '"idx_Points_SmGeometry"',
      "Points"
    );

    const result = await detect(fixture, "Points");

    expect(result.capability).toEqual({
      supported: true,
      rtreeAvailable: true,
      fallbackAvailable: true,
      diagnosticReason: null
    });
    expect(result.detected).toMatchObject({
      idColumn: "SmID",
      envelopeColumn: "SmGeometry",
      payloadColumn: "SmGeometry",
      cadTypeColumn: null,
      rtreeName: "idx_Points_SmGeometry"
    });
  });

  it("reports envelope-cache fallback for a point dataset without RTree", async () => {
    const fixture = await makeFixture();
    await fixture.ds.createPointDataset("Points", 4326);

    const result = await detect(fixture, "Points");

    expect(result.capability).toEqual({
      supported: true,
      rtreeAvailable: false,
      fallbackAvailable: true,
      diagnosticReason: "spatial_index_unavailable"
    });
    expect(result.detected).toMatchObject({
      idColumn: "SmID",
      envelopeColumn: "SmGeometry",
      payloadColumn: "SmGeometry",
      rtreeName: null
    });
  });

  it("detects Text envelope roles from SmIndexKey", async () => {
    const fixture = await makeFixture();
    await fixture.ds.createTextDataset("Labels", 4326);

    const result = await detect(fixture, "Labels");

    expect(result.capability).toEqual({
      supported: true,
      rtreeAvailable: false,
      fallbackAvailable: true,
      diagnosticReason: "spatial_index_unavailable"
    });
    expect(result.detected).toMatchObject({
      idColumn: "SmID",
      envelopeColumn: "SmIndexKey",
      payloadColumn: "SmGeometry",
      rtreeName: null
    });

    await addRTree(fixture, '"idx_Labels_SmIndexKey"', "Labels");
    const withRTree = await detect(fixture, "Labels");
    expect(withRTree.capability.rtreeAvailable).toBe(true);
    expect(withRTree.detected?.rtreeName).toBe("idx_Labels_SmIndexKey");
  });

  it("detects CAD envelope roles and SmGeoType column", async () => {
    const fixture = await makeFixture();
    await fixture.ds.createCadDataset("CADDT");
    await fixture.driver.exec(
      `ALTER TABLE "CADDT" ADD COLUMN "SmIndexKey" POLYGON`
    );
    await fixture.driver.exec(
      `ALTER TABLE "CADDT" ADD COLUMN "SmGeoType" INTEGER`
    );
    await executeSql(
      fixture.driver,
      `INSERT INTO geometry_columns (
         f_table_name, f_geometry_column, geometry_type,
         coord_dimension, srid, spatial_index_enabled
       ) VALUES (?, ?, ?, ?, ?, ?)`,
      ["CADDT", "SmIndexKey", 3, 2, 0, 0]
    );

    const result = await detect(fixture, "CADDT");

    expect(result.capability).toEqual({
      supported: true,
      rtreeAvailable: false,
      fallbackAvailable: true,
      diagnosticReason: "spatial_index_unavailable"
    });
    expect(result.detected).toMatchObject({
      idColumn: "SmID",
      envelopeColumn: "SmIndexKey",
      payloadColumn: "SmGeometry",
      cadTypeColumn: "SmGeoType"
    });

    await addRTree(fixture, '"idx_CADDT_SmIndexKey"', "CADDT");
    const withRTree = await detect(fixture, "CADDT");
    expect(withRTree.capability.rtreeAvailable).toBe(true);
  });

  it("rejects tabular datasets as unsupported kind", async () => {
    const fixture = await makeFixture();
    await fixture.ds.createTabularDataset("T1");

    const result = await detect(fixture, "T1");

    expect(result.capability).toEqual({
      supported: false,
      rtreeAvailable: false,
      fallbackAvailable: false,
      diagnosticReason: "unsupported_dataset_kind"
    });
    expect(result.detected).toBeNull();
  });

  it("exposes register spatial metadata for detection inputs", async () => {
    const fixture = await makeFixture();
    await fixture.ds.createPointDataset("Points", 4326);

    const meta = await fixture.register.findSpatialMetadata("Points");

    expect(meta).toMatchObject({
      idColumnName: "SmID",
      geometryColumnName: "SmGeometry",
      extent: null
    });
  });
});

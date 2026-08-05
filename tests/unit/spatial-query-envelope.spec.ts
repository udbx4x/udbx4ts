import { describe, expect, it } from "vitest";

import { UdbxDataSource } from "../../src/core/datasource/UdbxDataSource";
import {
  GAIA_ENVELOPE_HEADER_LENGTH,
  readGaiaEnvelope
} from "../../src/core/geometry/gaia/GaiaEnvelope";
import { GaiaFormatError } from "../../src/core/geometry/gaia/GaiaErrors";
import { GaiaGeometryCodec } from "../../src/core/geometry/gaia/GaiaGeometryCodec";
import { SmRegisterRepository } from "../../src/core/schema/SmRegisterRepository";
import { SpatialQuerier } from "../../src/core/spatial/SpatialQuerier";
import {
  EnvelopeCacheManager,
  type EnvelopeCachePolicy
} from "../../src/core/spatial/envelopeCache";
import { executeSql } from "../../src/core/sql/SqlHelpers";
import type { SqlDriver } from "../../src/core/sql/SqlDriver";
import type { DatasetInfo } from "../../src/core/types";
import { NodeSqliteDriver } from "../support/NodeSqliteDriver";

interface PointFixture {
  readonly id: number;
  readonly x: number;
  readonly y: number;
}

async function makeEnvelopePointFixture(
  points: readonly PointFixture[],
  policy?: EnvelopeCachePolicy
): Promise<{ info: DatasetInfo; querier: SpatialQuerier }> {
  const driver = new NodeSqliteDriver();
  const ds = await UdbxDataSource.create({
    driver,
    target: { kind: "memory" },
    runtime: "unknown"
  });
  await ds.createPointDataset("Points", 4326);

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
  }

  const register = new SmRegisterRepository(driver);
  const info = await register.findByName("Points");
  if (!info) {
    throw new Error("Points dataset missing");
  }
  const querier = policy
    ? new SpatialQuerier(driver, {
        envelopeCacheManager: new EnvelopeCacheManager(policy)
      })
    : new SpatialQuerier(driver);
  return { info, querier };
}

describe("spatial query envelope cache path", () => {
  it("returns viewport-matching features in stable SmID order", async () => {
    const { querier, info } = await makeEnvelopePointFixture([
      { id: 1, x: 1, y: 1 },
      { id: 2, x: 2, y: 2 },
      { id: 3, x: 10, y: 10 }
    ]);

    const result = await querier.query(info, {
      bounds: { minX: 0, minY: 0, maxX: 5, maxY: 5 },
      limit: 10
    });

    expect(result.strategy).toBe("envelope_cache");
    expect(result.hasMore).toBe(false);
    expect(result.features.map((f) => f.id)).toEqual([1, 2]);
    expect(result.features[0]?.geometry.type).toBe("Point");
  });

  it("treats MBR boundary contact as intersecting", async () => {
    const { querier, info } = await makeEnvelopePointFixture([
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
    const { querier, info } = await makeEnvelopePointFixture([
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
    const { querier, info } = await makeEnvelopePointFixture([
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

  it("fails with envelope_cache_budget_exceeded when policy is exceeded", async () => {
    const { querier, info } = await makeEnvelopePointFixture(
      [
        { id: 1, x: 1, y: 1 },
        { id: 2, x: 2, y: 2 }
      ],
      {
        datasetBytes: 4 * 1024 * 1024,
        sourceBytes: 64 * 1024 * 1024,
        fixedRSSChargeBytes: 4 * 1024 * 1024,
        rssChargePerCapacityEntry: 80
      }
    );

    await expect(
      querier.query(info, {
        bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 },
        limit: 10
      })
    ).rejects.toMatchObject({
      reason: "envelope_cache_budget_exceeded"
    });
  });

  it("fails with corrupt_geometry for a malformed envelope", async () => {
    const driver = new NodeSqliteDriver();
    const ds = await UdbxDataSource.create({
      driver,
      target: { kind: "memory" },
      runtime: "unknown"
    });
    await ds.createPointDataset("Points", 4326);
    await executeSql(
      driver,
      `INSERT INTO "Points" (SmID, SmUserID, SmGeometry) VALUES (?, ?, ?)`,
      [1, 0, new Uint8Array([0x01, 0x02])]
    );
    const register = new SmRegisterRepository(driver);
    const info = await register.findByName("Points");
    if (!info) {
      throw new Error("Points dataset missing");
    }

    await expect(
      new SpatialQuerier(driver).query(info, {
        bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
        limit: 10
      })
    ).rejects.toMatchObject({ reason: "corrupt_geometry" });
  });
});

describe("readGaiaEnvelope", () => {
  it("reads the MBR from a GAIA geometry header", () => {
    const blob = GaiaGeometryCodec.encode(
      { type: "Point", coordinates: [3, 4] },
      4326
    );
    expect(blob.length).toBeGreaterThanOrEqual(GAIA_ENVELOPE_HEADER_LENGTH);

    const envelope = readGaiaEnvelope(blob);

    expect(envelope).toEqual({ minX: 3, minY: 4, maxX: 3, maxY: 4 });
  });

  it("rejects truncated headers", () => {
    expect(() =>
      readGaiaEnvelope(new Uint8Array(GAIA_ENVELOPE_HEADER_LENGTH - 1))
    ).toThrow(GaiaFormatError);
  });
});

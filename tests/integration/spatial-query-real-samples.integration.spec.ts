import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  UdbxDataSource,
  type Feature,
  type ReadableDataset
} from "../../src/index";
import { NodeSqliteDriver } from "../support/NodeSqliteDriver";

const __dirname = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(__dirname, "../../..");
const sampleDataPath = resolve(workspaceRoot, "data/SampleData.udbx");
const henanPath = resolve(workspaceRoot, "data/henan.udbx");

async function openSample(path: string): Promise<UdbxDataSource> {
  return UdbxDataSource.open({
    driver: new NodeSqliteDriver(),
    target: { kind: "file", path }
  });
}

const WIDE_BOUNDS = { minX: -180, minY: -90, maxX: 180, maxY: 90 };

describe("spatial query real samples", () => {
  it("queries henan.udbx weibo through RTree with stable ordering", async () => {
    const ds = await openSample(henanPath);
    try {
      const result = await ds.querySpatial("weibo", {
        bounds: WIDE_BOUNDS,
        limit: 10
      });

      expect(result.strategy).toBe("rtree");
      expect(result.hasMore).toBe(true);
      expect(result.features).toHaveLength(10);
      const ids = result.features.map((feature) => feature.id);
      expect(ids).toEqual([...ids].sort((a, b) => a - b));
      expect(new Set(ids).size).toBe(ids.length);
      for (const feature of result.features) {
        expect(feature.geometry.type).toBe("Point");
      }
    } finally {
      await ds.close();
    }
  });

  it("appends offscreen required IDs for henan.udbx weibo", async () => {
    const ds = await openSample(henanPath);
    try {
      const dataset = (await ds.getDataset("weibo")) as ReadableDataset<Feature>;
      const samples = await dataset.list({ limit: 1, offset: 5000 });
      expect(samples).toHaveLength(1);
      const requiredId = samples[0]!.id;

      const result = await ds.querySpatial("weibo", {
        bounds: { minX: 0, minY: 0, maxX: 0.0001, maxY: 0.0001 },
        limit: 10,
        requiredIds: [requiredId]
      });

      expect(result.strategy).toBe("rtree");
      expect(result.features.map((feature) => feature.id)).toContain(
        requiredId
      );
    } finally {
      await ds.close();
    }
  });

  it("queries SampleData.udbx County_T Text by envelope cache", async () => {
    const ds = await openSample(sampleDataPath);
    try {
      const result = await ds.querySpatial("County_T", {
        bounds: WIDE_BOUNDS,
        limit: 100
      });

      expect(result.strategy).toBe("envelope_cache");
      expect(result.features.length).toBeGreaterThan(0);
      expect(result.features[0]?.geometry.type).toBe("Text");
    } finally {
      await ds.close();
    }
  });

  it("queries SampleData.udbx CADDT CAD by envelope cache for supported rows", async () => {
    const ds = await openSample(sampleDataPath);
    try {
      const result = await ds.querySpatial("CADDT", {
        bounds: WIDE_BOUNDS,
        limit: 77
      });

      expect(result.strategy).toBe("envelope_cache");
      expect(result.features).toHaveLength(77);
      expect(result.features[0]?.geometry.type).toMatch(/^Cad/);
    } finally {
      await ds.close();
    }
  });

  it("fails with corrupt_geometry when CADDT rows exceed codec support", async () => {
    const ds = await openSample(sampleDataPath);
    try {
      // CADDT 第 78-92 行为 geoType 7，超出 TS/Go CAD 最小基线（point/line/region）。
      await expect(
        ds.querySpatial("CADDT", {
          bounds: WIDE_BOUNDS,
          limit: 100
        })
      ).rejects.toMatchObject({ reason: "corrupt_geometry" });
    } finally {
      await ds.close();
    }
  });
});

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { UdbxDataSource, type Feature, type ReadableDataset } from "../../src/index";
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

describe("real UDBX samples", () => {
  it("reads SampleData.udbx BaseMap_P point dataset", async () => {
    const ds = await openSample(sampleDataPath);

    try {
      const dataset = await ds.getDataset("BaseMap_P") as ReadableDataset<Feature>;

      expect(dataset.info).toMatchObject({
        name: "BaseMap_P",
        kind: "point",
        objectCount: 15,
        srid: 4326
      });
      await expect(dataset.count()).resolves.toBe(15);

      const feature = await dataset.getById(1);
      expect(feature).toMatchObject({
        id: 1,
        geometry: { type: "Point" },
        attributes: {
          NAME: "蓟县",
          CODE: 120225,
          ADCLASS: 4
        }
      });
    } finally {
      await ds.close();
    }
  });

  it("reads SampleData.udbx CADDT CAD dataset", async () => {
    const ds = await openSample(sampleDataPath);

    try {
      const dataset = await ds.getDataset("CADDT") as ReadableDataset<Feature>;

      expect(dataset.info).toMatchObject({
        name: "CADDT",
        kind: "cad",
        objectCount: 92
      });
      await expect(dataset.count()).resolves.toBe(92);

      const features = await dataset.list({ limit: 5 });
      expect(features).toHaveLength(5);
      expect(features[0]?.geometry.type).toMatch(/^Cad/);
    } finally {
      await ds.close();
    }
  });

  it("reads SampleData.udbx line and region datasets", async () => {
    const ds = await openSample(sampleDataPath);

    try {
      const line = await ds.getDataset("BaseMap_L") as ReadableDataset<Feature>;
      const region = await ds.getDataset("BaseMap_R") as ReadableDataset<Feature>;

      expect(line.info).toMatchObject({
        name: "BaseMap_L",
        kind: "line",
        objectCount: 47,
        srid: 4326
      });
      expect(region.info).toMatchObject({
        name: "BaseMap_R",
        kind: "region",
        objectCount: 15,
        srid: 4326
      });

      await expect(line.count()).resolves.toBe(47);
      await expect(region.count()).resolves.toBe(15);

      const lineFeatures = await line.list({ limit: 1 });
      const regionFeatures = await region.list({ limit: 1 });
      expect(lineFeatures).toHaveLength(1);
      expect(regionFeatures).toHaveLength(1);
      expect(lineFeatures[0]?.geometry.type).toBe("MultiLineString");
      expect(regionFeatures[0]?.geometry.type).toBe("MultiPolygon");
    } finally {
      await ds.close();
    }
  });

  it("reads SampleData.udbx 3D vector datasets", async () => {
    const ds = await openSample(sampleDataPath);

    try {
      const pointZ = await ds.getDataset("BaseMap_PZ") as ReadableDataset<Feature>;
      const lineZ = await ds.getDataset("BaseMap_LZ") as ReadableDataset<Feature>;
      const regionZ = await ds.getDataset("BaseMap_RZ") as ReadableDataset<Feature>;

      expect(pointZ.info).toMatchObject({
        name: "BaseMap_PZ",
        kind: "pointZ",
        objectCount: 15,
        srid: 0
      });
      expect(lineZ.info).toMatchObject({
        name: "BaseMap_LZ",
        kind: "lineZ",
        objectCount: 47,
        srid: 0
      });
      expect(regionZ.info).toMatchObject({
        name: "BaseMap_RZ",
        kind: "regionZ",
        objectCount: 15,
        srid: 0
      });

      const pointFeature = await pointZ.getById(1);
      const lineFeatures = await lineZ.list({ limit: 1 });
      const regionFeatures = await regionZ.list({ limit: 1 });

      const pointGeometry = pointFeature?.geometry;
      expect(pointGeometry?.type).toBe("Point");
      expect(pointGeometry?.hasZ).toBe(true);
      if (pointGeometry?.type === "Point") {
        expect(pointGeometry.coordinates).toHaveLength(3);
      }

      expect(lineFeatures).toHaveLength(1);
      expect(lineFeatures[0]?.geometry.type).toBe("MultiLineString");
      expect(lineFeatures[0]?.geometry.hasZ).toBe(true);

      expect(regionFeatures).toHaveLength(1);
      expect(regionFeatures[0]?.geometry.type).toBe("MultiPolygon");
      expect(regionFeatures[0]?.geometry.hasZ).toBe(true);
    } finally {
      await ds.close();
    }
  });

  it("reads SampleData.udbx County_T Text dataset", async () => {
    const ds = await openSample(sampleDataPath);

    try {
      const dataset = await ds.getDataset("County_T") as ReadableDataset<Feature>;

      expect(dataset.info).toMatchObject({
        name: "County_T",
        kind: "text",
        objectCount: 15,
        srid: 4326
      });
      await expect(dataset.count()).resolves.toBe(15);

      const features = await dataset.list({ limit: 1 });
      expect(features).toHaveLength(1);
      expect(features[0]?.geometry.type).toBe("Text");
      if (features[0]?.geometry.type === "Text") {
        expect(features[0].geometry.anchor).toHaveLength(2);
        expect(Number.isFinite(features[0].geometry.anchor[0])).toBe(true);
        expect(Number.isFinite(features[0].geometry.anchor[1])).toBe(true);
        expect(features[0].geometry.style).toBeDefined();
      }
    } finally {
      await ds.close();
    }
  });

  it("reads SampleData.udbx TabularDT tabular dataset", async () => {
    const ds = await openSample(sampleDataPath);

    try {
      const dataset = await ds.getDataset("TabularDT");

      expect(dataset.info).toMatchObject({
        name: "TabularDT",
        kind: "tabular",
        objectCount: 15,
        tableName: "TabularDT",
        srid: 0
      });
      await expect(dataset.count()).resolves.toBe(15);

      const record = await dataset.getById(1);
      expect(record).toMatchObject({
        id: 1,
        attributes: {
          ADMI: 110227,
          NAME: "怀柔区",
          City: "北京市",
          POP_1999: 26.5
        }
      });
      expect(record?.attributes).not.toHaveProperty("SmGeometry");
    } finally {
      await ds.close();
    }
  });

  it("reads henan.udbx GeoText label dataset", async () => {
    const ds = await openSample(henanPath);

    try {
      const dataset = await ds.getDataset("河南省标签") as ReadableDataset<Feature>;

      expect(dataset.info).toMatchObject({
        name: "河南省标签",
        kind: "text",
        objectCount: 1,
        srid: 4490
      });

      const feature = await dataset.getById(1);
      expect(feature).toMatchObject({
        id: 1,
        geometry: {
          type: "Text",
          text: "河南省",
          style: {
            faceName: "宋体"
          }
        }
      });
      expect(feature?.geometry.type).toBe("Text");
      if (feature?.geometry.type === "Text") {
        expect(feature.geometry.anchor[0]).toBeCloseTo(113.165187569688, 12);
        expect(feature.geometry.anchor[1]).toBeCloseTo(33.875453985, 12);
        expect(feature.geometry.style?.fontHeight).toBeCloseTo(
          0.406494140625,
          12
        );
      }
    } finally {
      await ds.close();
    }
  });

  it("reads henan.udbx representative point, line and region datasets", async () => {
    const ds = await openSample(henanPath);

    try {
      const point = await ds.getDataset("居民地地名") as ReadableDataset<Feature>;
      const line = await ds.getDataset("公路") as ReadableDataset<Feature>;
      const region = await ds.getDataset("省级行政区划") as ReadableDataset<Feature>;

      expect(point.info).toMatchObject({
        name: "居民地地名",
        kind: "point",
        objectCount: 1863
      });
      expect(line.info).toMatchObject({
        name: "公路",
        kind: "line",
        objectCount: 7805
      });
      expect(region.info).toMatchObject({
        name: "省级行政区划",
        kind: "region",
        objectCount: 1
      });

      await expect(point.list({ limit: 1 })).resolves.toHaveLength(1);
      await expect(line.list({ limit: 1 })).resolves.toHaveLength(1);
      await expect(region.list({ limit: 1 })).resolves.toHaveLength(1);
    } finally {
      await ds.close();
    }
  });

  it("reads henan.udbx mixed SRID region dataset", async () => {
    const ds = await openSample(henanPath);

    try {
      const dataset = await ds.getDataset("水库面") as ReadableDataset<Feature>;

      expect(dataset.info).toMatchObject({
        name: "水库面",
        kind: "region",
        objectCount: 71,
        srid: 3857
      });
      await expect(dataset.count()).resolves.toBe(71);

      const features = await dataset.list({ limit: 1 });
      expect(features).toHaveLength(1);
      expect(features[0]?.geometry.type).toBe("MultiPolygon");
    } finally {
      await ds.close();
    }
  });

  it("reads henan.udbx datasets whose names differ from table names", async () => {
    const ds = await openSample(henanPath);

    try {
      const streetRoad = await ds.getDataset("streetroad") as ReadableDataset<Feature>;
      const gRoad = await ds.getDataset("groad") as ReadableDataset<Feature>;
      const city = await ds.getDataset("city") as ReadableDataset<Feature>;

      expect(streetRoad.info).toMatchObject({
        name: "streetroad",
        tableName: "街道",
        kind: "point",
        objectCount: 63
      });
      expect(gRoad.info).toMatchObject({
        name: "groad",
        tableName: "国道",
        kind: "line",
        objectCount: 164
      });
      expect(city.info).toMatchObject({
        name: "city",
        tableName: "市级行政区划",
        kind: "region",
        objectCount: 18
      });

      await expect(streetRoad.count()).resolves.toBe(63);
      await expect(gRoad.count()).resolves.toBe(164);
      await expect(city.count()).resolves.toBe(18);

      await expect(streetRoad.list({ limit: 1 })).resolves.toHaveLength(1);
      await expect(gRoad.list({ limit: 1 })).resolves.toHaveLength(1);
      await expect(city.list({ limit: 1 })).resolves.toHaveLength(1);
    } finally {
      await ds.close();
    }
  });

  it("reads henan.udbx large point dataset pagination via table-name mapping", async () => {
    const ds = await openSample(henanPath);

    try {
      const dataset = await ds.getDataset("weibo") as ReadableDataset<Feature>;

      expect(dataset.info).toMatchObject({
        name: "weibo",
        tableName: "henan_P",
        kind: "point",
        objectCount: 469308,
        srid: 4326
      });

      const firstPage = await dataset.list({ limit: 3, offset: 0 });
      const secondPage = await dataset.list({ limit: 3, offset: 3 });

      expect(firstPage).toHaveLength(3);
      expect(secondPage).toHaveLength(3);
      expect(firstPage.map((feature) => feature.id)).toEqual([1, 2, 3]);
      expect(secondPage.map((feature) => feature.id)).toEqual([4, 5, 6]);
      expect(firstPage[0]?.attributes).toMatchObject({
        count1: 0,
        count2: 0
      });
    } finally {
      await ds.close();
    }
  });
});

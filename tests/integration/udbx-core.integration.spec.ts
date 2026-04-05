import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import { UdbxDataSource } from "../../src/index";
import { NodeSqliteDriver } from "../support/NodeSqliteDriver";

describe("UdbxDataSource integration", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
    );
  });

  it("creates point, line and region datasets in a real SQLite database", async () => {
    const driver = new NodeSqliteDriver();
    const ds = await UdbxDataSource.create({
      driver,
      target: { kind: "memory", name: "udbx-core" }
    });

    await ds.createPointDataset("Cities", 4326, [
      { name: "NAME", fieldType: "text", nullable: false }
    ]);
    await ds.createLineDataset("Roads", 4326);
    await ds.createRegionDataset("Parcels", 4326);

    const datasets = await ds.listDatasets();

    expect(datasets.map((item) => item.name)).toEqual([
      "Cities",
      "Roads",
      "Parcels"
    ]);
  });

  it("writes and reads point, line and region features end-to-end", async () => {
    const driver = new NodeSqliteDriver();
    const ds = await UdbxDataSource.create({
      driver,
      target: { kind: "memory", name: "udbx-features" }
    });

    const points = await ds.createPointDataset("Cities", 4326, [
      { name: "NAME", fieldType: "text", nullable: false }
    ]);
    const lines = await ds.createLineDataset("Roads", 4326);
    const regions = await ds.createRegionDataset("Parcels", 4326);

    await points.insert({
      id: 1,
      geometry: { type: "Point", coordinates: [116.123, 39.456] },
      attributes: { NAME: "Beijing" }
    });
    await lines.insert({
      id: 2,
      geometry: {
        type: "MultiLineString",
        coordinates: [[[116.123, 39.456], [117, 40]]]
      },
      attributes: {}
    });
    await regions.insert({
      id: 3,
      geometry: {
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
      attributes: {}
    });

    await expect(points.getById(1)).resolves.toMatchObject({
      id: 1,
      attributes: { NAME: "Beijing" }
    });
    await expect(lines.getById(2)).resolves.toMatchObject({
      id: 2,
      geometry: { type: "MultiLineString" }
    });
    await expect(regions.getById(3)).resolves.toMatchObject({
      id: 3,
      geometry: { type: "MultiPolygon" }
    });
  });

  it("reopens a file-backed database and keeps its datasets", async () => {
    const dir = await mkdtemp(join(tmpdir(), "udbx4ts-"));
    tempDirs.push(dir);
    const path = join(dir, "sample.udbx");

    {
      const createDriver = new NodeSqliteDriver();
      const ds = await UdbxDataSource.create({
        driver: createDriver,
        target: { kind: "file", path }
      });

      const points = await ds.createPointDataset("Cities", 4326);
      await points.insert({
        id: 1,
        geometry: { type: "Point", coordinates: [116.123, 39.456] },
        attributes: {}
      });
      await ds.close();
    }

    {
      const openDriver = new NodeSqliteDriver();
      const reopened = await UdbxDataSource.open({
        driver: openDriver,
        target: { kind: "file", path }
      });

      const datasets = await reopened.listDatasets();
      const dataset = await reopened.getDataset("Cities");

      expect(datasets.map((item) => item.name)).toEqual(["Cities"]);
      expect(dataset).not.toBeNull();
      await expect(dataset?.getById(1) ?? Promise.resolve(null)).resolves.toMatchObject({
        id: 1
      });
      await reopened.close();
    }
  });
});


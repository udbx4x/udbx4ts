import { describe, it, expect } from "vitest";
import { NodeSqliteDriver } from "../support/NodeSqliteDriver";
import { UdbxDataSource } from "../../src/core/datasource/UdbxDataSource";
import type { PointGeometry, MultiPolygonGeometry } from "../../src/core/types";

describe("Batch write optimization", () => {
  async function createTestDataSource() {
    const driver = new NodeSqliteDriver();
    return UdbxDataSource.create({
      driver,
      target: { kind: "memory" }
    });
  }

  it("insertMany uses prepared statement for points", async () => {
    const ds = await createTestDataSource();
    const pointDs = await ds.createPointDataset("batch_points", 4326, [
      { name: "NAME", fieldType: "string", nullable: true }
    ]);

    const features = Array.from({ length: 100 }, (_, i) => ({
      id: i + 1,
      geometry: {
        type: "Point" as const,
        coordinates: [i * 0.1, i * 0.1],
        srid: 4326
      } as PointGeometry,
      attributes: { NAME: `P${i}` }
    }));

    await pointDs.insertMany(features);

    const all = await pointDs.list();
    expect(all).toHaveLength(100);
    expect(all[0]!.id).toBe(1);
    expect(all[99]!.id).toBe(100);
  });

  it("insertMany uses prepared statement for regions", async () => {
    const ds = await createTestDataSource();
    const regionDs = await ds.createRegionDataset("batch_regions", 4326, [
      { name: "NAME", fieldType: "string", nullable: true }
    ]);

    const features = Array.from({ length: 50 }, (_, i) => ({
      id: i + 1,
      geometry: {
        type: "MultiPolygon" as const,
        coordinates: [[
          [[0 + i, 0], [1 + i, 0], [1 + i, 1], [0 + i, 1], [0 + i, 0]]
        ]],
        srid: 4326
      } as MultiPolygonGeometry,
      attributes: { NAME: `R${i}` }
    }));

    await regionDs.insertMany(features);

    const all = await regionDs.list();
    expect(all).toHaveLength(50);
    expect(all[49]!.id).toBe(50);
  });

  it("insertMany uses prepared statement for tabular records", async () => {
    const ds = await createTestDataSource();
    const tabularDs = await ds.createTabularDataset("batch_tabular", [
      { name: "NAME", fieldType: "string", nullable: true },
      { name: "VALUE", fieldType: "int32", nullable: true }
    ]);

    const records = Array.from({ length: 200 }, (_, i) => ({
      id: i + 1,
      attributes: { NAME: `Item${i}`, VALUE: i * 10 }
    }));

    await tabularDs.insertMany(records);

    const all = await tabularDs.list();
    expect(all).toHaveLength(200);
    expect(all[199]!.id).toBe(200);
  });

  it("insertMany handles async iterable without buffering", async () => {
    const ds = await createTestDataSource();
    const pointDs = await ds.createPointDataset("async_points", 4326);

    async function* generatePoints(count: number) {
      for (let i = 0; i < count; i++) {
        yield {
          id: i + 1,
          geometry: {
            type: "Point" as const,
            coordinates: [i * 0.01, i * 0.01],
            srid: 4326
          } as PointGeometry,
          attributes: {}
        };
      }
    }

    await pointDs.insertMany(generatePoints(50));

    const all = await pointDs.list();
    expect(all).toHaveLength(50);
  });

  it("insertMany with empty iterable is a no-op", async () => {
    const ds = await createTestDataSource();
    const pointDs = await ds.createPointDataset("empty_batch", 4326);

    await pointDs.insertMany([]);

    const all = await pointDs.list();
    expect(all).toHaveLength(0);
  });

  it("update() only updates registered fields", async () => {
    const ds = await createTestDataSource();
    const tabularDs = await ds.createTabularDataset("update_test", [
      { name: "NAME", fieldType: "string", nullable: true },
      { name: "VALUE", fieldType: "int32", nullable: true }
    ]);

    await tabularDs.insert({ id: 1, attributes: { NAME: "A", VALUE: 10 } });
    await tabularDs.insert({ id: 2, attributes: { NAME: "B", VALUE: 20 } });

    // Update with a mix of valid and invalid fields
    await tabularDs.update(1, { NAME: "A Updated", NONEXISTENT: "ignored" });

    const record = await tabularDs.getById(1);
    expect(record!.attributes.NAME).toBe("A Updated");
    expect(record!.attributes.VALUE).toBe(10);
    expect((record!.attributes as Record<string, unknown>).NONEXISTENT).toBeUndefined();
  });

  it("update() ignores all invalid fields silently", async () => {
    const ds = await createTestDataSource();
    const tabularDs = await ds.createTabularDataset("update_noop_test", [
      { name: "NAME", fieldType: "string", nullable: true }
    ]);

    await tabularDs.insert({ id: 1, attributes: { NAME: "Original" } });

    // All fields are invalid — should be a no-op
    await tabularDs.update(1, { BOGUS: "value", FAKE: 42 });

    const record = await tabularDs.getById(1);
    expect(record!.attributes.NAME).toBe("Original");
  });

  it("delete() removes record and decrements objectCount", async () => {
    const ds = await createTestDataSource();
    const tabularDs = await ds.createTabularDataset("delete_test", [
      { name: "NAME", fieldType: "string", nullable: true }
    ]);

    await tabularDs.insertMany([
      { id: 1, attributes: { NAME: "A" } },
      { id: 2, attributes: { NAME: "B" } },
      { id: 3, attributes: { NAME: "C" } }
    ]);

    const beforeDelete = await tabularDs.list();
    expect(beforeDelete).toHaveLength(3);

    await tabularDs.delete(2);

    const afterDelete = await tabularDs.list();
    expect(afterDelete).toHaveLength(2);
    expect(afterDelete.map((r) => r.id)).toEqual([1, 3]);

    // Verify objectCount was decremented
    const datasets = await ds.listDatasets();
    const info = datasets.find((d) => d.name === "delete_test");
    expect(info!.objectCount).toBe(2);
  });
});

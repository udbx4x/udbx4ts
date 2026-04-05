import { describe, expect, it } from "vitest";

import { UdbxDataSource } from "../../src/core/datasource/UdbxDataSource";
import { TabularDataset } from "../../src/core/dataset/TabularDataset";
import { PointDataset } from "../../src/core/dataset/PointDataset";
import { NodeSqliteDriver } from "../support/NodeSqliteDriver";
import { GaiaPointCodec } from "../../src/core/geometry/gaia/GaiaPointCodec";

describe("Streaming reads", () => {
  async function createPopulatedDatasource(recordCount: number): Promise<{
    driver: NodeSqliteDriver;
    ds: UdbxDataSource;
  }> {
    const driver = new NodeSqliteDriver();
    const ds = await UdbxDataSource.create({
      driver,
      target: { kind: "memory" }
    });

    const pointDs = await ds.createPointDataset("Points", 4326, [
      { name: "NAME", fieldType: "text", nullable: true }
    ]);

    const blob = GaiaPointCodec.writePoint(
      { type: "Point", coordinates: [116.0, 39.0] },
      4326
    );

    for (let i = 1; i <= recordCount; i++) {
      await pointDs.insert({
        id: i,
        geometry: { type: "Point", coordinates: [116.0 + i * 0.001, 39.0] },
        attributes: { NAME: `Point_${i}` }
      });
    }

    return { driver, ds };
  }

  it("streams point features one at a time via AsyncIterable", async () => {
    const { ds } = await createPopulatedDatasource(100);
    const dataset = (await ds.getDataset("Points")) as PointDataset;

    const collected: number[] = [];
    for await (const feature of dataset.iterate()) {
      collected.push(feature.id);
    }

    expect(collected).toHaveLength(100);
    expect(collected[0]).toBe(1);
    expect(collected[99]).toBe(100);

    await ds.close();
  });

  it("streams with filter options", async () => {
    const { ds } = await createPopulatedDatasource(50);
    const dataset = (await ds.getDataset("Points")) as PointDataset;

    const collected: number[] = [];
    for await (const feature of dataset.iterate({ ids: [10, 20, 30] })) {
      collected.push(feature.id);
    }

    expect(collected).toEqual([10, 20, 30]);

    await ds.close();
  });

  it("streams tabular records", async () => {
    const driver = new NodeSqliteDriver();
    const ds = await UdbxDataSource.create({
      driver,
      target: { kind: "memory" }
    });

    const tabular = await ds.createTabularDataset("Records", [
      { name: "VALUE", fieldType: "int32", nullable: true }
    ]);

    for (let i = 1; i <= 50; i++) {
      await tabular.insert({
        id: i,
        attributes: { VALUE: i * 10 }
      });
    }

    const dataset = (await ds.getDataset("Records")) as TabularDataset;

    const values: number[] = [];
    for await (const record of dataset.iterate()) {
      values.push(record.attributes.VALUE as number);
    }

    expect(values).toHaveLength(50);
    expect(values[0]).toBe(10);
    expect(values[49]).toBe(500);

    await ds.close();
  });

  it("list reads all records at once while iterate yields incrementally", async () => {
    const { ds } = await createPopulatedDatasource(20);
    const dataset = (await ds.getDataset("Points")) as PointDataset;

    const listResult = await dataset.list();
    expect(listResult).toHaveLength(20);

    let iterateCount = 0;
    for await (const _ of dataset.iterate()) {
      iterateCount++;
      if (iterateCount === 5) {
        // Prove we can stop early without reading all records
        break;
      }
    }

    expect(iterateCount).toBe(5);

    await ds.close();
  });
});

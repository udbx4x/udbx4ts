import { describe, expect, it } from "vitest";

import { CadGeometryCodec, UdbxDataSource } from "../../src/index";
import { NodeSqliteDriver } from "../support/NodeSqliteDriver";
import type { CadFeature } from "../../src/core/dataset/CadDataset";
import type { CadGeometry } from "../../src/core/types";

const markerStyle = {
  kind: "marker" as const,
  markerStyle: 1,
  markerSize: 20,
  markerAngle: 0,
  markerColor: 0xff0000ff,
  markerWidth: 20,
  markerHeight: 20,
  fillOpaqueRate: 100,
  fillGradientType: 0,
  fillAngle: 0,
  fillCenterOffsetX: 0,
  fillCenterOffsetY: 0,
  fillBackcolor: 0xffffffff
};

const lineStyle = {
  kind: "line" as const,
  lineStyle: 1,
  lineWidth: 10,
  lineColor: 0xff00ff00
};

const fillStyle = {
  kind: "fill" as const,
  lineStyle: 1,
  lineWidth: 10,
  lineColor: 0xff000000,
  fillStyle: 1,
  fillForecolor: 0xff00ffff,
  fillBackcolor: 0xffffffff,
  fillOpaquerate: 100,
  fillGadientType: 0,
  fillAngle: 0,
  fillCenterOffsetX: 0,
  fillCenterOffsetY: 0
};

describe("CadGeometryCodec", () => {
  it("roundtrips CAD point bytes", () => {
    const geometry = {
      type: "CadPoint" as const,
      x: 116.123,
      y: 39.456,
      style: markerStyle
    };

    const bytes = CadGeometryCodec.write(geometry);
    const decoded = CadGeometryCodec.read(bytes);

    expect(CadGeometryCodec.write(decoded)).toEqual(bytes);
    expect(decoded).toMatchObject({
      type: "CadPoint",
      geoType: 1,
      x: 116.123,
      y: 39.456
    });
  });

  it("roundtrips CAD line and region bytes", () => {
    const line: CadGeometry = {
      type: "CadLine" as const,
      numSub: 1,
      subPointCounts: [3],
      coordinates: [
        [116.123, 39.456],
        [116.8, 39.9],
        [117.2, 40.1]
      ],
      style: lineStyle
    };
    const region: CadGeometry = {
      type: "CadRegion" as const,
      numSub: 1,
      subPointCounts: [5],
      coordinates: [
        [116, 39.2],
        [117.4, 39.2],
        [117.4, 40.3],
        [116, 40.3],
        [116, 39.2]
      ],
      style: fillStyle
    };

    expect(CadGeometryCodec.read(CadGeometryCodec.write(line))).toMatchObject({
      type: "CadLine",
      geoType: 3,
      subPointCounts: [3]
    });
    expect(CadGeometryCodec.read(CadGeometryCodec.write(region))).toMatchObject({
      type: "CadRegion",
      geoType: 5,
      subPointCounts: [5]
    });
  });
});

describe("CadDataset", () => {
  it("creates, writes, reads, updates and deletes CAD features", async () => {
    const ds = await UdbxDataSource.create({
      driver: new NodeSqliteDriver(),
      target: { kind: "memory" },
      runtime: "electron"
    });

    const cad = await ds.createCadDataset("cad_features", [
      { name: "NAME", fieldType: "text", nullable: false }
    ]);

    const feature: CadFeature<{ NAME: string }> = {
      id: 1,
      geometry: {
        type: "CadPoint",
        x: 116.123,
        y: 39.456,
        style: markerStyle
      },
      attributes: { NAME: "CAD Control Point" }
    };

    await cad.insert(feature);
    expect(await cad.count()).toBe(1);

    const loaded = await cad.getById(1);
    expect(loaded?.geometry).toMatchObject({
      type: "CadPoint",
      geoType: 1,
      x: 116.123,
      y: 39.456
    });
    expect(loaded?.attributes.NAME).toBe("CAD Control Point");

    await cad.update(1, {
      geometry: {
        type: "CadPoint",
        x: 117.2,
        y: 40.1,
        style: markerStyle
      },
      attributes: { NAME: "CAD Updated Point" }
    });

    const updated = await cad.getById(1);
    expect(updated?.geometry).toMatchObject({ x: 117.2, y: 40.1 });
    expect(updated?.attributes.NAME).toBe("CAD Updated Point");

    await cad.delete(1);
    expect(await cad.count()).toBe(0);

    await ds.close();
  });
});

import { describe, expect, it } from "vitest";

import {
  GaiaFormatError,
  GaiaGeoTypeMismatchError,
  GaiaPointCodec,
  GEO_TYPE_POINT,
  GEO_TYPE_POINTZ,
  readGaiaHeader
} from "../../src/index";
import { BinaryCursor } from "../../src/core/utils/BinaryCursor";

function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.replace(/\s+/g, "");
  const bytes = new Uint8Array(normalized.length / 2);

  for (let index = 0; index < normalized.length; index += 2) {
    bytes[index / 2] = Number.parseInt(normalized.slice(index, index + 2), 16);
  }

  return bytes;
}

const pointHex = `
  00 01 e6 10 00 00
  1d 5a 64 3b df 07 5d 40
  ee 7c 3f 35 5e ba 43 40
  1d 5a 64 3b df 07 5d 40
  ee 7c 3f 35 5e ba 43 40
  7c 01 00 00 00
  1d 5a 64 3b df 07 5d 40
  ee 7c 3f 35 5e ba 43 40
  fe
`;

const pointZHex = `
  00 01 e6 10 00 00
  1d 5a 64 3b df 07 5d 40
  ee 7c 3f 35 5e ba 43 40
  1d 5a 64 3b df 07 5d 40
  ee 7c 3f 35 5e ba 43 40
  7c e9 03 00 00
  1d 5a 64 3b df 07 5d 40
  ee 7c 3f 35 5e ba 43 40
  00 00 00 00 00 00 29 40
  fe
`;

describe("GAIA header", () => {
  it("reads the common GAIA header for a point geometry", () => {
    const cursor = new BinaryCursor(hexToBytes(pointHex));
    const header = readGaiaHeader(cursor);

    expect(header.srid).toBe(4326);
    expect(header.geoType).toBe(GEO_TYPE_POINT);
    expect(header.mbr[0]).toBeCloseTo(116.123);
    expect(header.mbr[1]).toBeCloseTo(39.456);
    expect(header.mbr[2]).toBeCloseTo(116.123);
    expect(header.mbr[3]).toBeCloseTo(39.456);
    expect(cursor.position).toBe(header.geometryDataOffset);
  });

  it("rejects invalid start markers", () => {
    const bytes = hexToBytes(pointHex);
    bytes[0] = 0xff;

    expect(() => readGaiaHeader(new BinaryCursor(bytes))).toThrow(GaiaFormatError);
  });

  it("rejects unexpected geo types", () => {
    expect(() =>
      readGaiaHeader(new BinaryCursor(hexToBytes(pointHex)), GEO_TYPE_POINTZ)
    ).toThrow(GaiaGeoTypeMismatchError);
  });
});

describe("GaiaPointCodec", () => {
  it("decodes a 2D point from golden bytes", () => {
    const geometry = GaiaPointCodec.readPoint(hexToBytes(pointHex));

    expect(geometry.type).toBe("Point");
    expect(geometry.coordinates[0]).toBeCloseTo(116.123);
    expect(geometry.coordinates[1]).toBeCloseTo(39.456);
    expect(geometry.srid).toBe(4326);
    expect(geometry.geoType).toBe(GEO_TYPE_POINT);
    expect(geometry.hasZ).toBe(false);
  });

  it("encodes a 2D point to the expected golden bytes", () => {
    const bytes = GaiaPointCodec.writePoint(
      { type: "Point", coordinates: [116.123, 39.456] },
      4326
    );

    expect(bytes).toEqual(hexToBytes(pointHex));
  });

  it("decodes a 3D point from golden bytes", () => {
    const geometry = GaiaPointCodec.readPointZ(hexToBytes(pointZHex));

    expect(geometry.type).toBe("Point");
    expect(geometry.coordinates[0]).toBeCloseTo(116.123);
    expect(geometry.coordinates[1]).toBeCloseTo(39.456);
    expect(geometry.coordinates[2]).toBeCloseTo(12.5);
    expect(geometry.srid).toBe(4326);
    expect(geometry.geoType).toBe(GEO_TYPE_POINTZ);
    expect(geometry.hasZ).toBe(true);
  });

  it("encodes a 3D point to the expected golden bytes", () => {
    const bytes = GaiaPointCodec.writePointZ(
      { type: "Point", coordinates: [116.123, 39.456, 12.5] },
      4326
    );

    expect(bytes).toEqual(hexToBytes(pointZHex));
  });

  it("rejects writing a 3D geometry through the 2D encoder", () => {
    expect(() =>
      GaiaPointCodec.writePoint(
        { type: "Point", coordinates: [116.123, 39.456, 12.5] },
        4326
      )
    ).toThrow(GaiaFormatError);
  });
});


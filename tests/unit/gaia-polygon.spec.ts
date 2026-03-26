import { describe, expect, it } from "vitest";

import {
  GaiaFormatError,
  GaiaPolygonCodec,
  GEO_TYPE_MULTIPOLYGON,
  GEO_TYPE_MULTIPOLYGONZ
} from "../../src/index";

function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.replace(/\s+/g, "");
  const bytes = new Uint8Array(normalized.length / 2);

  for (let index = 0; index < normalized.length; index += 2) {
    bytes[index / 2] = Number.parseInt(normalized.slice(index, index + 2), 16);
  }

  return bytes;
}

const polygonHex = `
  00 01 e6 10 00 00
  1d 5a 64 3b df 07 5d 40
  ee 7c 3f 35 5e ba 43 40
  00 00 00 00 00 40 5d 40
  00 00 00 00 00 00 44 40
  7c 06 00 00 00
  01 00 00 00
  69 03 00 00 00
  01 00 00 00
  05 00 00 00
  1d 5a 64 3b df 07 5d 40 ee 7c 3f 35 5e ba 43 40
  00 00 00 00 00 40 5d 40 ee 7c 3f 35 5e ba 43 40
  00 00 00 00 00 40 5d 40 00 00 00 00 00 00 44 40
  1d 5a 64 3b df 07 5d 40 00 00 00 00 00 00 44 40
  1d 5a 64 3b df 07 5d 40 ee 7c 3f 35 5e ba 43 40
  fe
`;

const polygonZHex = `
  00 01 e6 10 00 00
  1d 5a 64 3b df 07 5d 40
  ee 7c 3f 35 5e ba 43 40
  00 00 00 00 00 40 5d 40
  00 00 00 00 00 00 44 40
  7c ee 03 00 00
  01 00 00 00
  69 eb 03 00 00
  01 00 00 00
  05 00 00 00
  1d 5a 64 3b df 07 5d 40 ee 7c 3f 35 5e ba 43 40 00 00 00 00 00 00 24 40
  00 00 00 00 00 40 5d 40 ee 7c 3f 35 5e ba 43 40 00 00 00 00 00 00 24 40
  00 00 00 00 00 40 5d 40 00 00 00 00 00 00 44 40 00 00 00 00 00 00 34 40
  1d 5a 64 3b df 07 5d 40 00 00 00 00 00 00 44 40 00 00 00 00 00 00 34 40
  1d 5a 64 3b df 07 5d 40 ee 7c 3f 35 5e ba 43 40 00 00 00 00 00 00 24 40
  fe
`;

describe("GaiaPolygonCodec", () => {
  it("decodes a 2D multipolygon from golden bytes", () => {
    const geometry = GaiaPolygonCodec.readMultiPolygon(hexToBytes(polygonHex));

    expect(geometry.type).toBe("MultiPolygon");
    expect(geometry.geoType).toBe(GEO_TYPE_MULTIPOLYGON);
    expect(geometry.coordinates).toEqual([
      [
        [
          [116.123, 39.456],
          [117, 39.456],
          [117, 40],
          [116.123, 40],
          [116.123, 39.456]
        ]
      ]
    ]);
  });

  it("encodes a 2D multipolygon to the expected golden bytes", () => {
    const bytes = GaiaPolygonCodec.writeMultiPolygon(
      {
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
      4326
    );

    expect(bytes).toEqual(hexToBytes(polygonHex));
  });

  it("decodes a 3D multipolygon from golden bytes", () => {
    const geometry = GaiaPolygonCodec.readMultiPolygonZ(hexToBytes(polygonZHex));

    expect(geometry.type).toBe("MultiPolygon");
    expect(geometry.geoType).toBe(GEO_TYPE_MULTIPOLYGONZ);
    expect(geometry.coordinates).toEqual([
      [
        [
          [116.123, 39.456, 10],
          [117, 39.456, 10],
          [117, 40, 20],
          [116.123, 40, 20],
          [116.123, 39.456, 10]
        ]
      ]
    ]);
  });

  it("encodes a 3D multipolygon to the expected golden bytes", () => {
    const bytes = GaiaPolygonCodec.writeMultiPolygonZ(
      {
        type: "MultiPolygon",
        coordinates: [
          [
            [
              [116.123, 39.456, 10],
              [117, 39.456, 10],
              [117, 40, 20],
              [116.123, 40, 20],
              [116.123, 39.456, 10]
            ]
          ]
        ]
      },
      4326
    );

    expect(bytes).toEqual(hexToBytes(polygonZHex));
  });

  it("rejects 3D coordinates in the 2D encoder", () => {
    expect(() =>
      GaiaPolygonCodec.writeMultiPolygon(
        {
          type: "MultiPolygon",
          coordinates: [
            [
              [
                [116.123, 39.456, 10],
                [117, 39.456, 10],
                [117, 40, 20],
                [116.123, 40, 20],
                [116.123, 39.456, 10]
              ]
            ]
          ]
        },
        4326
      )
    ).toThrow(GaiaFormatError);
  });
});


import { describe, expect, it } from "vitest";

import {
  GaiaFormatError,
  GaiaLineCodec,
  GEO_TYPE_MULTILINESTRING,
  GEO_TYPE_MULTILINESTRINGZ
} from "../../src/index";

function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.replace(/\s+/g, "");
  const bytes = new Uint8Array(normalized.length / 2);

  for (let index = 0; index < normalized.length; index += 2) {
    bytes[index / 2] = Number.parseInt(normalized.slice(index, index + 2), 16);
  }

  return bytes;
}

const lineHex = `
  00 01 e6 10 00 00
  1d 5a 64 3b df 07 5d 40
  ee 7c 3f 35 5e ba 43 40
  00 00 00 00 00 40 5d 40
  00 00 00 00 00 00 44 40
  7c 05 00 00 00
  01 00 00 00
  69 02 00 00 00
  02 00 00 00
  1d 5a 64 3b df 07 5d 40
  ee 7c 3f 35 5e ba 43 40
  00 00 00 00 00 40 5d 40
  00 00 00 00 00 00 44 40
  fe
`;

const lineZHex = `
  00 01 e6 10 00 00
  1d 5a 64 3b df 07 5d 40
  ee 7c 3f 35 5e ba 43 40
  00 00 00 00 00 40 5d 40
  00 00 00 00 00 00 44 40
  7c ed 03 00 00
  01 00 00 00
  69 ea 03 00 00
  02 00 00 00
  1d 5a 64 3b df 07 5d 40
  ee 7c 3f 35 5e ba 43 40
  00 00 00 00 00 00 29 40
  00 00 00 00 00 40 5d 40
  00 00 00 00 00 00 44 40
  00 00 00 00 00 00 34 40
  fe
`;

describe("GaiaLineCodec", () => {
  it("decodes a 2D multiline string from golden bytes", () => {
    const geometry = GaiaLineCodec.readMultiLineString(hexToBytes(lineHex));

    expect(geometry.type).toBe("MultiLineString");
    expect(geometry.geoType).toBe(GEO_TYPE_MULTILINESTRING);
    expect(geometry.coordinates).toEqual([
      [
        [116.123, 39.456],
        [117, 40]
      ]
    ]);
  });

  it("encodes a 2D multiline string to the expected golden bytes", () => {
    const bytes = GaiaLineCodec.writeMultiLineString(
      {
        type: "MultiLineString",
        coordinates: [
          [
            [116.123, 39.456],
            [117, 40]
          ]
        ]
      },
      4326
    );

    expect(bytes).toEqual(hexToBytes(lineHex));
  });

  it("decodes a 3D multiline string from golden bytes", () => {
    const geometry = GaiaLineCodec.readMultiLineStringZ(hexToBytes(lineZHex));

    expect(geometry.type).toBe("MultiLineString");
    expect(geometry.geoType).toBe(GEO_TYPE_MULTILINESTRINGZ);
    expect(geometry.coordinates).toEqual([
      [
        [116.123, 39.456, 12.5],
        [117, 40, 20]
      ]
    ]);
  });

  it("encodes a 3D multiline string to the expected golden bytes", () => {
    const bytes = GaiaLineCodec.writeMultiLineStringZ(
      {
        type: "MultiLineString",
        coordinates: [
          [
            [116.123, 39.456, 12.5],
            [117, 40, 20]
          ]
        ]
      },
      4326
    );

    expect(bytes).toEqual(hexToBytes(lineZHex));
  });

  it("rejects 3D coordinates in the 2D encoder", () => {
    expect(() =>
      GaiaLineCodec.writeMultiLineString(
        {
          type: "MultiLineString",
          coordinates: [
            [
              [116.123, 39.456, 12.5],
              [117, 40, 20]
            ]
          ]
        },
        4326
      )
    ).toThrow(GaiaFormatError);
  });
});


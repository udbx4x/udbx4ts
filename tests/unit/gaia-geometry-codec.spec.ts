import { describe, expect, it } from "vitest";

import {
  GaiaGeometryCodec,
  GaiaUnsupportedGeoTypeError
} from "../../src/index";

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

describe("GaiaGeometryCodec", () => {
  it("auto-detects and decodes a GAIA geometry", () => {
    const geometry = GaiaGeometryCodec.decode(hexToBytes(pointHex));

    expect(geometry.type).toBe("Point");
    if (geometry.type === "Point") {
      expect(geometry.coordinates).toEqual([116.123, 39.456]);
    }
  });

  it("auto-selects the encoder based on geometry type and dimensionality", () => {
    const bytes = GaiaGeometryCodec.encode(
      {
        type: "Point",
        coordinates: [116.123, 39.456, 12.5]
      },
      4326
    );

    const decoded = GaiaGeometryCodec.decode(bytes);
    expect(decoded).toEqual({
      type: "Point",
      coordinates: [116.123, 39.456, 12.5],
      srid: 4326,
      bbox: [116.123, 39.456, 116.123, 39.456],
      hasZ: true,
      geoType: 1001
    });
  });

  it("rejects unsupported geo types", () => {
    const bytes = hexToBytes(pointHex);
    bytes[39] = 0x88;
    bytes[40] = 0x13;
    bytes[41] = 0x00;
    bytes[42] = 0x00;

    expect(() => GaiaGeometryCodec.decode(bytes)).toThrow(
      GaiaUnsupportedGeoTypeError
    );
  });
});


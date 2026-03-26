import type { MultiLineStringGeometry } from "../../types";
import { BinaryCursor } from "../../utils/BinaryCursor";
import { BinaryWriter } from "../../utils/BinaryWriter";
import {
  GAIA_END,
  GEO_TYPE_MULTILINESTRING,
  GEO_TYPE_MULTILINESTRINGZ
} from "./GaiaConstants";
import { GaiaFormatError } from "./GaiaErrors";
import { readGaiaHeader, validateGaiaEnd } from "./GaiaHeader";
import { writeGaiaHeader } from "./GaiaPointCodec";

const GAIA_ENTITY_MARK = 0x69;
const GEO_TYPE_LINESTRING = 2;
const GEO_TYPE_LINESTRINGZ = 1002;

type Line2D = ReadonlyArray<readonly [number, number]>;
type Line3D = ReadonlyArray<readonly [number, number, number]>;

function is3DCoordinates(
  coordinates: MultiLineStringGeometry["coordinates"]
): coordinates is ReadonlyArray<Line3D> {
  return coordinates[0]?.[0]?.length === 3;
}

function createLineMbr(
  coordinates: MultiLineStringGeometry["coordinates"]
): readonly [number, number, number, number] {
  const xs: number[] = [];
  const ys: number[] = [];

  for (const line of coordinates) {
    for (const point of line) {
      xs.push(point[0]);
      ys.push(point[1]);
    }
  }

  if (xs.length === 0) {
    throw new GaiaFormatError("MultiLineString must contain at least one point.");
  }

  return [
    Math.min(...xs),
    Math.min(...ys),
    Math.max(...xs),
    Math.max(...ys)
  ];
}

export class GaiaLineCodec {
  static readMultiLineString(input: Uint8Array): MultiLineStringGeometry {
    const cursor = new BinaryCursor(input);
    const header = readGaiaHeader(cursor, GEO_TYPE_MULTILINESTRING);
    const lineCount = cursor.readInt32(true);
    const coordinates: Array<Array<readonly [number, number]>> = [];

    for (let lineIndex = 0; lineIndex < lineCount; lineIndex += 1) {
      const entityMark = cursor.readUint8();
      if (entityMark !== GAIA_ENTITY_MARK) {
        throw new GaiaFormatError(
          `Invalid LineString entity mark: expected 0x${GAIA_ENTITY_MARK.toString(16)}, got 0x${entityMark.toString(16)}.`
        );
      }

      const lineGeoType = cursor.readInt32(true);
      if (lineGeoType !== GEO_TYPE_LINESTRING) {
        throw new GaiaFormatError(
          `Invalid LineString geoType: expected ${GEO_TYPE_LINESTRING}, got ${lineGeoType}.`
        );
      }

      const pointCount = cursor.readInt32(true);
      const line: Array<readonly [number, number]> = [];

      for (let pointIndex = 0; pointIndex < pointCount; pointIndex += 1) {
        line.push([cursor.readFloat64(true), cursor.readFloat64(true)]);
      }

      coordinates.push(line);
    }

    validateGaiaEnd(cursor);

    return {
      type: "MultiLineString",
      coordinates,
      srid: header.srid,
      bbox: header.mbr,
      hasZ: false,
      geoType: header.geoType
    };
  }

  static readMultiLineStringZ(input: Uint8Array): MultiLineStringGeometry {
    const cursor = new BinaryCursor(input);
    const header = readGaiaHeader(cursor, GEO_TYPE_MULTILINESTRINGZ);
    const lineCount = cursor.readInt32(true);
    const coordinates: Array<Array<readonly [number, number, number]>> = [];

    for (let lineIndex = 0; lineIndex < lineCount; lineIndex += 1) {
      const entityMark = cursor.readUint8();
      if (entityMark !== GAIA_ENTITY_MARK) {
        throw new GaiaFormatError(
          `Invalid LineString entity mark: expected 0x${GAIA_ENTITY_MARK.toString(16)}, got 0x${entityMark.toString(16)}.`
        );
      }

      const lineGeoType = cursor.readInt32(true);
      if (lineGeoType !== GEO_TYPE_LINESTRINGZ) {
        throw new GaiaFormatError(
          `Invalid LineStringZ geoType: expected ${GEO_TYPE_LINESTRINGZ}, got ${lineGeoType}.`
        );
      }

      const pointCount = cursor.readInt32(true);
      const line: Array<readonly [number, number, number]> = [];

      for (let pointIndex = 0; pointIndex < pointCount; pointIndex += 1) {
        line.push([
          cursor.readFloat64(true),
          cursor.readFloat64(true),
          cursor.readFloat64(true)
        ]);
      }

      coordinates.push(line);
    }

    validateGaiaEnd(cursor);

    return {
      type: "MultiLineString",
      coordinates,
      srid: header.srid,
      bbox: header.mbr,
      hasZ: true,
      geoType: header.geoType
    };
  }

  static writeMultiLineString(
    geometry: MultiLineStringGeometry,
    srid: number
  ): Uint8Array {
    if (is3DCoordinates(geometry.coordinates)) {
      throw new GaiaFormatError(
        "writeMultiLineString expects 2D coordinates."
      );
    }

    const writer = new BinaryWriter();
    writeGaiaHeader(
      writer,
      srid,
      createLineMbr(geometry.coordinates),
      GEO_TYPE_MULTILINESTRING
    );
    writer.writeInt32(geometry.coordinates.length, true);

    for (const line of geometry.coordinates) {
      writer.writeUint8(GAIA_ENTITY_MARK);
      writer.writeInt32(GEO_TYPE_LINESTRING, true);
      writer.writeInt32(line.length, true);
      for (const point of line) {
        writer.writeFloat64(point[0], true);
        writer.writeFloat64(point[1], true);
      }
    }

    writer.writeUint8(GAIA_END);
    return writer.toUint8Array();
  }

  static writeMultiLineStringZ(
    geometry: MultiLineStringGeometry,
    srid: number
  ): Uint8Array {
    if (!is3DCoordinates(geometry.coordinates)) {
      throw new GaiaFormatError(
        "writeMultiLineStringZ expects 3D coordinates."
      );
    }

    const writer = new BinaryWriter();
    writeGaiaHeader(
      writer,
      srid,
      createLineMbr(geometry.coordinates),
      GEO_TYPE_MULTILINESTRINGZ
    );
    writer.writeInt32(geometry.coordinates.length, true);

    for (const line of geometry.coordinates) {
      writer.writeUint8(GAIA_ENTITY_MARK);
      writer.writeInt32(GEO_TYPE_LINESTRINGZ, true);
      writer.writeInt32(line.length, true);
      for (const point of line) {
        writer.writeFloat64(point[0], true);
        writer.writeFloat64(point[1], true);
        writer.writeFloat64(point[2], true);
      }
    }

    writer.writeUint8(GAIA_END);
    return writer.toUint8Array();
  }
}


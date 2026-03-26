import type { PointGeometry } from "../../types";
import { BinaryCursor } from "../../utils/BinaryCursor";
import { BinaryWriter } from "../../utils/BinaryWriter";
import {
  GAIA_BYTE_ORDER_LE,
  GAIA_END,
  GAIA_MBR,
  GAIA_START,
  GEO_TYPE_POINT,
  GEO_TYPE_POINTZ
} from "./GaiaConstants";
import { GaiaFormatError } from "./GaiaErrors";
import { readGaiaHeader, validateGaiaEnd } from "./GaiaHeader";

function isPoint3D(geometry: PointGeometry): geometry is PointGeometry & {
  readonly coordinates: [number, number, number];
} {
  return geometry.coordinates.length === 3;
}

function createPointMbr(
  coordinates: readonly [number, number] | readonly [number, number, number]
): readonly [number, number, number, number] {
  return [coordinates[0], coordinates[1], coordinates[0], coordinates[1]];
}

export function writeGaiaHeader(
  writer: BinaryWriter,
  srid: number,
  mbr: readonly [number, number, number, number],
  geoType: number
): void {
  writer.writeUint8(GAIA_START);
  writer.writeUint8(GAIA_BYTE_ORDER_LE);
  writer.writeInt32(srid, true);
  writer.writeFloat64(mbr[0], true);
  writer.writeFloat64(mbr[1], true);
  writer.writeFloat64(mbr[2], true);
  writer.writeFloat64(mbr[3], true);
  writer.writeUint8(GAIA_MBR);
  writer.writeInt32(geoType, true);
}

export class GaiaPointCodec {
  static readPoint(input: Uint8Array): PointGeometry {
    const cursor = new BinaryCursor(input);
    const header = readGaiaHeader(cursor, GEO_TYPE_POINT);

    const x = cursor.readFloat64(true);
    const y = cursor.readFloat64(true);
    validateGaiaEnd(cursor);

    return {
      type: "Point",
      coordinates: [x, y],
      srid: header.srid,
      bbox: header.mbr,
      hasZ: false,
      geoType: header.geoType
    };
  }

  static readPointZ(input: Uint8Array): PointGeometry {
    const cursor = new BinaryCursor(input);
    const header = readGaiaHeader(cursor, GEO_TYPE_POINTZ);

    const x = cursor.readFloat64(true);
    const y = cursor.readFloat64(true);
    const z = cursor.readFloat64(true);
    validateGaiaEnd(cursor);

    return {
      type: "Point",
      coordinates: [x, y, z],
      srid: header.srid,
      bbox: header.mbr,
      hasZ: true,
      geoType: header.geoType
    };
  }

  static writePoint(geometry: PointGeometry, srid: number): Uint8Array {
    if (isPoint3D(geometry)) {
      throw new GaiaFormatError("writePoint expects a 2D Point geometry.");
    }

    const writer = new BinaryWriter(60);
    const mbr = createPointMbr(geometry.coordinates);

    writeGaiaHeader(writer, srid, mbr, GEO_TYPE_POINT);
    writer.writeFloat64(geometry.coordinates[0], true);
    writer.writeFloat64(geometry.coordinates[1], true);
    writer.writeUint8(GAIA_END);

    return writer.toUint8Array();
  }

  static writePointZ(geometry: PointGeometry, srid: number): Uint8Array {
    if (!isPoint3D(geometry)) {
      throw new GaiaFormatError("writePointZ expects a 3D Point geometry.");
    }

    const writer = new BinaryWriter(68);
    const mbr = createPointMbr(geometry.coordinates);

    writeGaiaHeader(writer, srid, mbr, GEO_TYPE_POINTZ);
    writer.writeFloat64(geometry.coordinates[0], true);
    writer.writeFloat64(geometry.coordinates[1], true);
    writer.writeFloat64(geometry.coordinates[2], true);
    writer.writeUint8(GAIA_END);

    return writer.toUint8Array();
  }
}

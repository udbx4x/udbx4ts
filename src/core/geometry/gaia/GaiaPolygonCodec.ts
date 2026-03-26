import type { MultiPolygonGeometry } from "../../types";
import { BinaryCursor } from "../../utils/BinaryCursor";
import { BinaryWriter } from "../../utils/BinaryWriter";
import {
  GAIA_END,
  GEO_TYPE_MULTIPOLYGON,
  GEO_TYPE_MULTIPOLYGONZ
} from "./GaiaConstants";
import { GaiaFormatError } from "./GaiaErrors";
import { readGaiaHeader, validateGaiaEnd } from "./GaiaHeader";
import { writeGaiaHeader } from "./GaiaPointCodec";

const GAIA_ENTITY_MARK = 0x69;
const GEO_TYPE_POLYGON = 3;
const GEO_TYPE_POLYGONZ = 1003;

type Ring2D = ReadonlyArray<readonly [number, number]>;
type Polygon2D = ReadonlyArray<Ring2D>;
type Ring3D = ReadonlyArray<readonly [number, number, number]>;
type Polygon3D = ReadonlyArray<Ring3D>;

function is3DCoordinates(
  coordinates: MultiPolygonGeometry["coordinates"]
): coordinates is ReadonlyArray<Polygon3D> {
  return coordinates[0]?.[0]?.[0]?.length === 3;
}

function createPolygonMbr(
  coordinates: MultiPolygonGeometry["coordinates"]
): readonly [number, number, number, number] {
  const xs: number[] = [];
  const ys: number[] = [];

  for (const polygon of coordinates) {
    for (const ring of polygon) {
      for (const point of ring) {
        xs.push(point[0]);
        ys.push(point[1]);
      }
    }
  }

  if (xs.length === 0) {
    throw new GaiaFormatError("MultiPolygon must contain at least one point.");
  }

  return [
    Math.min(...xs),
    Math.min(...ys),
    Math.max(...xs),
    Math.max(...ys)
  ];
}

function writeRing2D(writer: BinaryWriter, ring: Ring2D): void {
  writer.writeInt32(ring.length, true);
  for (const point of ring) {
    writer.writeFloat64(point[0], true);
    writer.writeFloat64(point[1], true);
  }
}

function writeRing3D(writer: BinaryWriter, ring: Ring3D): void {
  writer.writeInt32(ring.length, true);
  for (const point of ring) {
    writer.writeFloat64(point[0], true);
    writer.writeFloat64(point[1], true);
    writer.writeFloat64(point[2], true);
  }
}

function readRing2D(cursor: BinaryCursor): Array<readonly [number, number]> {
  const pointCount = cursor.readInt32(true);
  const ring: Array<readonly [number, number]> = [];

  for (let pointIndex = 0; pointIndex < pointCount; pointIndex += 1) {
    ring.push([cursor.readFloat64(true), cursor.readFloat64(true)]);
  }

  return ring;
}

function readRing3D(
  cursor: BinaryCursor
): Array<readonly [number, number, number]> {
  const pointCount = cursor.readInt32(true);
  const ring: Array<readonly [number, number, number]> = [];

  for (let pointIndex = 0; pointIndex < pointCount; pointIndex += 1) {
    ring.push([
      cursor.readFloat64(true),
      cursor.readFloat64(true),
      cursor.readFloat64(true)
    ]);
  }

  return ring;
}

export class GaiaPolygonCodec {
  static readMultiPolygon(input: Uint8Array): MultiPolygonGeometry {
    const cursor = new BinaryCursor(input);
    const header = readGaiaHeader(cursor, GEO_TYPE_MULTIPOLYGON);
    const polygonCount = cursor.readInt32(true);
    const coordinates: Array<Array<Array<readonly [number, number]>>> = [];

    for (let polygonIndex = 0; polygonIndex < polygonCount; polygonIndex += 1) {
      const entityMark = cursor.readUint8();
      if (entityMark !== GAIA_ENTITY_MARK) {
        throw new GaiaFormatError(
          `Invalid Polygon entity mark: expected 0x${GAIA_ENTITY_MARK.toString(16)}, got 0x${entityMark.toString(16)}.`
        );
      }

      const polygonGeoType = cursor.readInt32(true);
      if (polygonGeoType !== GEO_TYPE_POLYGON) {
        throw new GaiaFormatError(
          `Invalid Polygon geoType: expected ${GEO_TYPE_POLYGON}, got ${polygonGeoType}.`
        );
      }

      const ringCount = cursor.readInt32(true);
      if (ringCount < 1) {
        throw new GaiaFormatError(
          `Polygon must contain at least one ring, got ${ringCount}.`
        );
      }

      const polygon: Array<Array<readonly [number, number]>> = [];
      for (let ringIndex = 0; ringIndex < ringCount; ringIndex += 1) {
        polygon.push(readRing2D(cursor));
      }

      coordinates.push(polygon);
    }

    validateGaiaEnd(cursor);

    return {
      type: "MultiPolygon",
      coordinates,
      srid: header.srid,
      bbox: header.mbr,
      hasZ: false,
      geoType: header.geoType
    };
  }

  static readMultiPolygonZ(input: Uint8Array): MultiPolygonGeometry {
    const cursor = new BinaryCursor(input);
    const header = readGaiaHeader(cursor, GEO_TYPE_MULTIPOLYGONZ);
    const polygonCount = cursor.readInt32(true);
    const coordinates: Array<Array<Array<readonly [number, number, number]>>> =
      [];

    for (let polygonIndex = 0; polygonIndex < polygonCount; polygonIndex += 1) {
      const entityMark = cursor.readUint8();
      if (entityMark !== GAIA_ENTITY_MARK) {
        throw new GaiaFormatError(
          `Invalid Polygon entity mark: expected 0x${GAIA_ENTITY_MARK.toString(16)}, got 0x${entityMark.toString(16)}.`
        );
      }

      const polygonGeoType = cursor.readInt32(true);
      if (polygonGeoType !== GEO_TYPE_POLYGONZ) {
        throw new GaiaFormatError(
          `Invalid PolygonZ geoType: expected ${GEO_TYPE_POLYGONZ}, got ${polygonGeoType}.`
        );
      }

      const ringCount = cursor.readInt32(true);
      if (ringCount < 1) {
        throw new GaiaFormatError(
          `Polygon must contain at least one ring, got ${ringCount}.`
        );
      }

      const polygon: Array<Array<readonly [number, number, number]>> = [];
      for (let ringIndex = 0; ringIndex < ringCount; ringIndex += 1) {
        polygon.push(readRing3D(cursor));
      }

      coordinates.push(polygon);
    }

    validateGaiaEnd(cursor);

    return {
      type: "MultiPolygon",
      coordinates,
      srid: header.srid,
      bbox: header.mbr,
      hasZ: true,
      geoType: header.geoType
    };
  }

  static writeMultiPolygon(
    geometry: MultiPolygonGeometry,
    srid: number
  ): Uint8Array {
    if (is3DCoordinates(geometry.coordinates)) {
      throw new GaiaFormatError("writeMultiPolygon expects 2D coordinates.");
    }

    const writer = new BinaryWriter();
    writeGaiaHeader(
      writer,
      srid,
      createPolygonMbr(geometry.coordinates),
      GEO_TYPE_MULTIPOLYGON
    );
    writer.writeInt32(geometry.coordinates.length, true);

    for (const polygon of geometry.coordinates) {
      writer.writeUint8(GAIA_ENTITY_MARK);
      writer.writeInt32(GEO_TYPE_POLYGON, true);
      writer.writeInt32(polygon.length, true);
      for (const ring of polygon) {
        writeRing2D(writer, ring);
      }
    }

    writer.writeUint8(GAIA_END);
    return writer.toUint8Array();
  }

  static writeMultiPolygonZ(
    geometry: MultiPolygonGeometry,
    srid: number
  ): Uint8Array {
    if (!is3DCoordinates(geometry.coordinates)) {
      throw new GaiaFormatError("writeMultiPolygonZ expects 3D coordinates.");
    }

    const writer = new BinaryWriter();
    writeGaiaHeader(
      writer,
      srid,
      createPolygonMbr(geometry.coordinates),
      GEO_TYPE_MULTIPOLYGONZ
    );
    writer.writeInt32(geometry.coordinates.length, true);

    for (const polygon of geometry.coordinates) {
      writer.writeUint8(GAIA_ENTITY_MARK);
      writer.writeInt32(GEO_TYPE_POLYGONZ, true);
      writer.writeInt32(polygon.length, true);
      for (const ring of polygon) {
        writeRing3D(writer, ring);
      }
    }

    writer.writeUint8(GAIA_END);
    return writer.toUint8Array();
  }
}


import type { CadGeometry, CadStyle } from "../../types";
import { BinaryCursor } from "../../utils/BinaryCursor";
import { BinaryWriter } from "../../utils/BinaryWriter";

const GEO_POINT = 1;
const GEO_LINE = 3;
const GEO_REGION = 5;

function readStyle(bytes: Uint8Array, geoType: number, size: number): CadStyle | undefined {
  if (size <= 0) {
    return undefined;
  }

  const cursor = new BinaryCursor(bytes);
  if (geoType === GEO_POINT) {
    cursor.readInt32();
    const style: CadStyle = {
      kind: "marker",
      markerStyle: cursor.readInt32(),
      markerSize: cursor.readInt32(),
      markerAngle: cursor.readInt32(),
      markerColor: cursor.readInt32(),
      markerWidth: cursor.readInt32(),
      markerHeight: cursor.readInt32(),
      fillOpaqueRate: 0,
      fillGradientType: 0,
      fillAngle: 0,
      fillCenterOffsetX: 0,
      fillCenterOffsetY: 0,
      fillBackcolor: 0
    };
    const reservedLength = cursor.readUint8();
    cursor.skip(reservedLength + 4);
    return {
      ...style,
      fillOpaqueRate: cursor.readInt8(),
      fillGradientType: cursor.readInt8(),
      fillAngle: cursor.readInt16(),
      fillCenterOffsetX: cursor.readInt16(),
      fillCenterOffsetY: cursor.readInt16(),
      fillBackcolor: cursor.readInt32()
    };
  }

  if (geoType === GEO_LINE) {
    const style: CadStyle = {
      kind: "line",
      lineStyle: cursor.readInt32(),
      lineWidth: cursor.readInt32(),
      lineColor: cursor.readInt32()
    };
    const reservedLength = cursor.readUint8();
    cursor.skip(reservedLength + 4);
    return style;
  }

  const style: CadStyle = {
    kind: "fill",
    lineStyle: cursor.readInt32(),
    lineWidth: cursor.readInt32(),
    lineColor: cursor.readInt32(),
    fillStyle: cursor.readInt32(),
    fillForecolor: cursor.readInt32(),
    fillBackcolor: cursor.readInt32(),
    fillOpaquerate: cursor.readInt8(),
    fillGadientType: cursor.readInt8(),
    fillAngle: cursor.readInt16(),
    fillCenterOffsetX: cursor.readInt16(),
    fillCenterOffsetY: cursor.readInt16()
  };
  const reserved1Length = cursor.readUint8();
  cursor.skip(reserved1Length + 4);
  const reserved2Length = cursor.readUint8();
  cursor.skip(reserved2Length + 4);
  return style;
}

function writeStyle(style: CadStyle | undefined): Uint8Array {
  if (!style) {
    return new Uint8Array();
  }

  const writer = new BinaryWriter();
  if (style.kind === "marker") {
    writer.writeInt32(41);
    writer.writeInt32(style.markerStyle);
    writer.writeInt32(style.markerSize);
    writer.writeInt32(style.markerAngle);
    writer.writeInt32(style.markerColor);
    writer.writeInt32(style.markerWidth);
    writer.writeInt32(style.markerHeight);
    writer.writeUint8(0);
    writer.writeInt32(0);
    writer.writeInt8(style.fillOpaqueRate);
    writer.writeInt8(style.fillGradientType);
    writer.writeInt16(style.fillAngle);
    writer.writeInt16(style.fillCenterOffsetX);
    writer.writeInt16(style.fillCenterOffsetY);
    writer.writeInt32(style.fillBackcolor);
    return writer.toUint8Array();
  }

  if (style.kind === "line") {
    writer.writeInt32(style.lineStyle);
    writer.writeInt32(style.lineWidth);
    writer.writeInt32(style.lineColor);
    writer.writeUint8(0);
    writer.writeInt32(0);
    return writer.toUint8Array();
  }

  writer.writeInt32(style.lineStyle);
  writer.writeInt32(style.lineWidth);
  writer.writeInt32(style.lineColor);
  writer.writeInt32(style.fillStyle);
  writer.writeInt32(style.fillForecolor);
  writer.writeInt32(style.fillBackcolor);
  writer.writeInt8(style.fillOpaquerate);
  writer.writeInt8(style.fillGadientType);
  writer.writeInt16(style.fillAngle);
  writer.writeInt16(style.fillCenterOffsetX);
  writer.writeInt16(style.fillCenterOffsetY);
  writer.writeUint8(0);
  writer.writeInt32(0);
  writer.writeUint8(0);
  writer.writeInt32(0);
  return writer.toUint8Array();
}

function readSubPointCounts(cursor: BinaryCursor, count: number): number[] {
  const counts: number[] = [];
  for (let index = 0; index < count; index++) {
    counts.push(cursor.readInt32());
  }
  return counts;
}

function totalPoints(counts: readonly number[]): number {
  return counts.reduce((sum, count) => sum + count, 0);
}

function readCoordinates(cursor: BinaryCursor, count: number): Array<[number, number]> {
  const coordinates: Array<[number, number]> = [];
  for (let index = 0; index < count; index++) {
    coordinates.push([cursor.readFloat64(), cursor.readFloat64()]);
  }
  return coordinates;
}

function writeLineOrRegionGeometry(writer: BinaryWriter, geometry: Extract<CadGeometry, { readonly type: "CadLine" | "CadRegion" }>): void {
  writer.writeInt32(geometry.numSub);
  for (const count of geometry.subPointCounts) {
    writer.writeInt32(count);
  }
  for (const [x, y] of geometry.coordinates) {
    writer.writeFloat64(x);
    writer.writeFloat64(y);
  }
}

export class CadGeometryCodec {
  static read(bytes: Uint8Array): CadGeometry {
    const cursor = new BinaryCursor(bytes);
    const geoType = cursor.readInt32();
    const styleSize = cursor.readInt32();
    const style = readStyle(
      bytes.slice(cursor.position, cursor.position + styleSize),
      geoType,
      styleSize
    );
    cursor.skip(styleSize);

    if (geoType === GEO_POINT) {
      const geometry = {
        type: "CadPoint" as const,
        geoType,
        x: cursor.readFloat64(),
        y: cursor.readFloat64()
      };
      return style ? { ...geometry, style } : geometry;
    }

    if (geoType === GEO_LINE) {
      const numSub = cursor.readInt32();
      const subPointCounts = readSubPointCounts(cursor, numSub);
      const coordinates = readCoordinates(cursor, totalPoints(subPointCounts));
      const geometry = {
        type: "CadLine" as const,
        geoType,
        numSub,
        subPointCounts,
        coordinates
      };
      return style ? { ...geometry, style } : geometry;
    }

    if (geoType === GEO_REGION) {
      const numSub = cursor.readInt32();
      const subPointCounts = readSubPointCounts(cursor, numSub);
      const coordinates = readCoordinates(cursor, totalPoints(subPointCounts));
      const geometry = {
        type: "CadRegion" as const,
        geoType,
        numSub,
        subPointCounts,
        coordinates
      };
      return style ? { ...geometry, style } : geometry;
    }

    throw new Error(`Unsupported CAD geoType: ${geoType}`);
  }

  static write(geometry: CadGeometry): Uint8Array {
    const geoType =
      geometry.type === "CadPoint"
        ? GEO_POINT
        : geometry.type === "CadLine"
          ? GEO_LINE
          : GEO_REGION;
    const styleBytes = writeStyle(geometry.style);
    const writer = new BinaryWriter();
    writer.writeInt32(geoType);
    writer.writeInt32(styleBytes.byteLength);
    writer.writeBytes(styleBytes);

    if (geometry.type === "CadPoint") {
      writer.writeFloat64(geometry.x);
      writer.writeFloat64(geometry.y);
    } else {
      writeLineOrRegionGeometry(writer, geometry);
    }

    return writer.toUint8Array();
  }
}

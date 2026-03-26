import { BinaryCursor } from "../../utils/BinaryCursor";
import {
  GAIA_BYTE_ORDER_LE,
  GAIA_END,
  GAIA_GEOMETRY_DATA_OFFSET,
  GAIA_MBR,
  GAIA_START
} from "./GaiaConstants";
import { GaiaFormatError, GaiaGeoTypeMismatchError } from "./GaiaErrors";

export interface GaiaHeader {
  readonly byteOrder: number;
  readonly srid: number;
  readonly mbr: readonly [number, number, number, number];
  readonly geoType: number;
  readonly geometryDataOffset: number;
}

export function readGaiaHeader(
  cursor: BinaryCursor,
  expectedGeoType?: number
): GaiaHeader {
  cursor.seek(0);

  const gaiaStart = cursor.readUint8();
  if (gaiaStart !== GAIA_START) {
    throw new GaiaFormatError(
      `Invalid GAIA start marker: expected 0x${GAIA_START.toString(16)}, got 0x${gaiaStart.toString(16)}.`
    );
  }

  const byteOrder = cursor.readUint8();
  if (byteOrder !== GAIA_BYTE_ORDER_LE) {
    throw new GaiaFormatError(
      `Unsupported byte order: expected 0x${GAIA_BYTE_ORDER_LE.toString(16)}, got 0x${byteOrder.toString(16)}.`
    );
  }

  const srid = cursor.readInt32(true);
  const minX = cursor.readFloat64(true);
  const minY = cursor.readFloat64(true);
  const maxX = cursor.readFloat64(true);
  const maxY = cursor.readFloat64(true);

  const gaiaMbr = cursor.readUint8();
  if (gaiaMbr !== GAIA_MBR) {
    throw new GaiaFormatError(
      `Invalid GAIA MBR marker: expected 0x${GAIA_MBR.toString(16)}, got 0x${gaiaMbr.toString(16)}.`
    );
  }

  const geoType = cursor.readInt32(true);
  if (expectedGeoType !== undefined && geoType !== expectedGeoType) {
    throw new GaiaGeoTypeMismatchError(expectedGeoType, geoType);
  }

  return {
    byteOrder,
    srid,
    mbr: [minX, minY, maxX, maxY],
    geoType,
    geometryDataOffset: GAIA_GEOMETRY_DATA_OFFSET
  };
}

export function validateGaiaEnd(cursor: BinaryCursor): void {
  const gaiaEnd = cursor.readUint8();
  if (gaiaEnd !== GAIA_END) {
    throw new GaiaFormatError(
      `Invalid GAIA end marker: expected 0x${GAIA_END.toString(16)}, got 0x${gaiaEnd.toString(16)}.`
    );
  }
}


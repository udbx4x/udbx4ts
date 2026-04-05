import type { Geometry, MultiLineStringGeometry, MultiPolygonGeometry, PointGeometry } from "../../types";
import { BinaryCursor } from "../../utils/BinaryCursor";
import {
  GEO_TYPE_MULTILINESTRING,
  GEO_TYPE_MULTILINESTRINGZ,
  GEO_TYPE_MULTIPOLYGON,
  GEO_TYPE_MULTIPOLYGONZ,
  GEO_TYPE_POINT,
  GEO_TYPE_POINTZ
} from "./GaiaConstants";
import { GaiaUnsupportedGeoTypeError } from "./GaiaErrors";
import { readGaiaHeader } from "./GaiaHeader";
import { GaiaLineCodec } from "./GaiaLineCodec";
import { GaiaPointCodec } from "./GaiaPointCodec";
import { GaiaPolygonCodec } from "./GaiaPolygonCodec";

type GaiaDecoder<TGeometry extends Geometry = Geometry> = (
  input: Uint8Array
) => TGeometry;

type GaiaEncoder<TGeometry extends Geometry = Geometry> = (
  geometry: TGeometry,
  srid: number
) => Uint8Array;

interface GaiaCodecEntry<TGeometry extends Geometry = Geometry> {
  readonly geoType: number;
  readonly decode: GaiaDecoder<TGeometry>;
}

const decodeByGeoType = new Map<number, GaiaDecoder>([
  [GEO_TYPE_POINT, GaiaPointCodec.readPoint],
  [GEO_TYPE_POINTZ, GaiaPointCodec.readPointZ],
  [GEO_TYPE_MULTILINESTRING, GaiaLineCodec.readMultiLineString],
  [GEO_TYPE_MULTILINESTRINGZ, GaiaLineCodec.readMultiLineStringZ],
  [GEO_TYPE_MULTIPOLYGON, GaiaPolygonCodec.readMultiPolygon],
  [GEO_TYPE_MULTIPOLYGONZ, GaiaPolygonCodec.readMultiPolygonZ]
]);

const pointCodecs: Record<number, GaiaCodecEntry<PointGeometry>> = {
  [GEO_TYPE_POINT]: {
    geoType: GEO_TYPE_POINT,
    decode: GaiaPointCodec.readPoint
  },
  [GEO_TYPE_POINTZ]: {
    geoType: GEO_TYPE_POINTZ,
    decode: GaiaPointCodec.readPointZ
  }
};

const lineCodecs: Record<number, GaiaCodecEntry<MultiLineStringGeometry>> = {
  [GEO_TYPE_MULTILINESTRING]: {
    geoType: GEO_TYPE_MULTILINESTRING,
    decode: GaiaLineCodec.readMultiLineString
  },
  [GEO_TYPE_MULTILINESTRINGZ]: {
    geoType: GEO_TYPE_MULTILINESTRINGZ,
    decode: GaiaLineCodec.readMultiLineStringZ
  }
};

const polygonCodecs: Record<number, GaiaCodecEntry<MultiPolygonGeometry>> = {
  [GEO_TYPE_MULTIPOLYGON]: {
    geoType: GEO_TYPE_MULTIPOLYGON,
    decode: GaiaPolygonCodec.readMultiPolygon
  },
  [GEO_TYPE_MULTIPOLYGONZ]: {
    geoType: GEO_TYPE_MULTIPOLYGONZ,
    decode: GaiaPolygonCodec.readMultiPolygonZ
  }
};

function geometryHasZ(
  geometry: Geometry
): boolean {
  switch (geometry.type) {
    case "Point":
      return geometry.coordinates.length === 3;
    case "MultiLineString":
      return geometry.coordinates[0]?.[0]?.length === 3;
    case "MultiPolygon":
      return geometry.coordinates[0]?.[0]?.[0]?.length === 3;
    case "Cad":
    case "Text":
      return false;
    default:
      return false;
  }
}

function encodeGeometry(geometry: Geometry, srid: number): Uint8Array {
  switch (geometry.type) {
    case "Point":
      return geometryHasZ(geometry)
        ? GaiaPointCodec.writePointZ(geometry, srid)
        : GaiaPointCodec.writePoint(geometry, srid);
    case "MultiLineString":
      return geometryHasZ(geometry)
        ? GaiaLineCodec.writeMultiLineStringZ(geometry, srid)
        : GaiaLineCodec.writeMultiLineString(geometry, srid);
    case "MultiPolygon":
      return geometryHasZ(geometry)
        ? GaiaPolygonCodec.writeMultiPolygonZ(geometry, srid)
        : GaiaPolygonCodec.writeMultiPolygon(geometry, srid);
    case "Cad":
      throw new Error("CAD geometry is not supported by GaiaGeometryCodec.");
    case "Text":
      throw new Error("Text geometry is not supported by GaiaGeometryCodec.");
    default:
      throw new Error(`Unsupported geometry type: ${(geometry as Geometry).type}`);
  }
}

export class GaiaGeometryCodec {
  static decode(input: Uint8Array): Geometry {
    const header = readGaiaHeader(new BinaryCursor(input));
    const decoder = decodeByGeoType.get(header.geoType);

    if (!decoder) {
      throw new GaiaUnsupportedGeoTypeError(header.geoType);
    }

    return decoder(input);
  }

  static encode(geometry: Geometry, srid: number): Uint8Array {
    return encodeGeometry(geometry, srid);
  }
}

import type {
  Geometry,
  MultiLineStringGeometry,
  MultiPolygonGeometry,
  PointGeometry
} from "../../types";
import { GaiaGeometryCodec } from "../gaia/GaiaGeometryCodec";

type JstsGeometry = import("jsts/org/locationtech/jts/geom/Geometry").default;

let reader: import("jsts/org/locationtech/jts/io/GeoJSONReader").default | null = null;
let writer: import("jsts/org/locationtech/jts/io/GeoJSONWriter").default | null = null;

async function getReader() {
  if (!reader) {
    const { default: GeoJSONReader } = await import(
      "jsts/org/locationtech/jts/io/GeoJSONReader"
    );
    const { default: GeometryFactory } = await import(
      "jsts/org/locationtech/jts/geom/GeometryFactory"
    );
    reader = new GeoJSONReader(new GeometryFactory());
  }
  return reader;
}

async function getWriter() {
  if (!writer) {
    const { default: GeoJSONWriter } = await import(
      "jsts/org/locationtech/jts/io/GeoJSONWriter"
    );
    writer = new GeoJSONWriter();
  }
  return writer;
}

export async function toJsts(geometry: Geometry): Promise<JstsGeometry> {
  const r = await getReader();
  return r.read(geometry as unknown as Record<string, unknown>);
}

export async function fromJsts(jtsGeom: JstsGeometry): Promise<Geometry> {
  const w = await getWriter();
  return w.write(jtsGeom) as unknown as Geometry;
}

export async function toJstsPoint(
  geometry: PointGeometry
): Promise<import("jsts/org/locationtech/jts/geom/Point").default> {
  const r = await getReader();
  return r.read(geometry as unknown as Record<string, unknown>) as import("jsts/org/locationtech/jts/geom/Point").default;
}

export async function toJstsMultiLineString(
  geometry: MultiLineStringGeometry
): Promise<import("jsts/org/locationtech/jts/geom/MultiLineString").default> {
  const r = await getReader();
  return r.read(geometry as unknown as Record<string, unknown>) as import("jsts/org/locationtech/jts/geom/MultiLineString").default;
}

export async function toJstsMultiPolygon(
  geometry: MultiPolygonGeometry
): Promise<import("jsts/org/locationtech/jts/geom/MultiPolygon").default> {
  const r = await getReader();
  return r.read(geometry as unknown as Record<string, unknown>) as import("jsts/org/locationtech/jts/geom/MultiPolygon").default;
}

export class JstsGeometryCodec {
  static async decode(input: Uint8Array): Promise<JstsGeometry> {
    const geojson = GaiaGeometryCodec.decode(input);
    return toJsts(geojson);
  }

  static async encode(jtsGeom: JstsGeometry, srid: number): Promise<Uint8Array> {
    const geojson = await fromJsts(jtsGeom);
    return GaiaGeometryCodec.encode(geojson, srid);
  }
}

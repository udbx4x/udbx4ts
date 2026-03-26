export interface GeometryBase {
  readonly srid?: number;
  readonly bbox?: readonly [number, number, number, number];
  readonly hasZ?: boolean;
  readonly geoType?: number;
}

export interface PointGeometry extends GeometryBase {
  readonly type: "Point";
  readonly coordinates: [number, number] | [number, number, number];
}

export interface MultiLineStringGeometry extends GeometryBase {
  readonly type: "MultiLineString";
  readonly coordinates:
    | ReadonlyArray<ReadonlyArray<readonly [number, number]>>
    | ReadonlyArray<ReadonlyArray<readonly [number, number, number]>>;
}

export interface MultiPolygonGeometry extends GeometryBase {
  readonly type: "MultiPolygon";
  readonly coordinates:
    | ReadonlyArray<ReadonlyArray<ReadonlyArray<readonly [number, number]>>>
    | ReadonlyArray<
        ReadonlyArray<ReadonlyArray<readonly [number, number, number]>>
      >;
}

export type Geometry =
  | PointGeometry
  | MultiLineStringGeometry
  | MultiPolygonGeometry;

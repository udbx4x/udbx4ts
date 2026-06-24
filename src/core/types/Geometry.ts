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

export type CadStyle =
  | {
      readonly kind: "marker";
      readonly markerStyle: number;
      readonly markerSize: number;
      readonly markerAngle: number;
      readonly markerColor: number;
      readonly markerWidth: number;
      readonly markerHeight: number;
      readonly fillOpaqueRate: number;
      readonly fillGradientType: number;
      readonly fillAngle: number;
      readonly fillCenterOffsetX: number;
      readonly fillCenterOffsetY: number;
      readonly fillBackcolor: number;
    }
  | {
      readonly kind: "line";
      readonly lineStyle: number;
      readonly lineWidth: number;
      readonly lineColor: number;
    }
  | {
      readonly kind: "fill";
      readonly lineStyle: number;
      readonly lineWidth: number;
      readonly lineColor: number;
      readonly fillStyle: number;
      readonly fillForecolor: number;
      readonly fillBackcolor: number;
      readonly fillOpaquerate: number;
      readonly fillGadientType: number;
      readonly fillAngle: number;
      readonly fillCenterOffsetX: number;
      readonly fillCenterOffsetY: number;
    };

export type CadGeometry =
  | (GeometryBase & {
      readonly type: "CadPoint";
      readonly x: number;
      readonly y: number;
      readonly style?: CadStyle;
    })
  | (GeometryBase & {
      readonly type: "CadLine";
      readonly numSub: number;
      readonly subPointCounts: readonly number[];
      readonly coordinates: ReadonlyArray<readonly [number, number]>;
      readonly style?: CadStyle;
    })
  | (GeometryBase & {
      readonly type: "CadRegion";
      readonly numSub: number;
      readonly subPointCounts: readonly number[];
      readonly coordinates: ReadonlyArray<readonly [number, number]>;
      readonly style?: CadStyle;
    });

export interface TextGeometry extends GeometryBase {
  readonly type: "Text";
  readonly text: string;
  readonly anchor: readonly [number, number];
  readonly rotation?: number;
  readonly style?: TextStyle;
  readonly subTexts?: readonly TextSubText[];
}

export interface Color {
  readonly a: number;
  readonly b: number;
  readonly g: number;
  readonly r: number;
}

export interface TextStyle {
  readonly color?: Color;
  readonly backgroundColor?: Color;
  readonly fixedSize?: number;
  readonly weight?: number;
  readonly styleFlag?: number;
  readonly alignFlag?: number;
  readonly fontWidth?: number;
  readonly fontHeight?: number;
  readonly anchor?: readonly [number, number];
  readonly faceName?: string;
}

export interface TextSubText {
  readonly text: string;
  readonly anchor: readonly [number, number];
  readonly rotation?: number;
}

export type Geometry =
  | PointGeometry
  | MultiLineStringGeometry
  | MultiPolygonGeometry
  | CadGeometry
  | TextGeometry;

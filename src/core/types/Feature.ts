import type { Geometry } from "./Geometry";

export interface Feature<
  TGeometry extends Geometry = Geometry,
  TAttributes extends Record<string, unknown> = Record<string, unknown>
> {
  readonly id: number;
  readonly geometry: TGeometry;
  readonly attributes: TAttributes;
}


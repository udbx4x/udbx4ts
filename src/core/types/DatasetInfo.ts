import type { DatasetKind } from "./DatasetKind";

export interface DatasetInfo {
  readonly id: number;
  readonly name: string;
  readonly kind: DatasetKind;
  readonly tableName: string;
  readonly srid: number | null;
  readonly objectCount: number;
  readonly geometryType: number | null;
}


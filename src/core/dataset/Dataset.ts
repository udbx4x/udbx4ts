import type { DatasetInfo, Feature, FieldInfo, QueryOptions } from "../types";

export interface Dataset {
  readonly info: DatasetInfo;
  getFields(): Promise<readonly FieldInfo[]>;
}

export interface ReadableDataset<TFeature extends Feature = Feature>
  extends Dataset {
  getById(id: number): Promise<TFeature | null>;
  list(options?: QueryOptions): Promise<readonly TFeature[]>;
  iterate(options?: QueryOptions): AsyncIterable<TFeature>;
  count(): Promise<number>;
}

export interface WritableDataset<TFeature extends Feature = Feature>
  extends ReadableDataset<TFeature> {
  insert(feature: TFeature): Promise<void>;
  insertMany(features: Iterable<TFeature> | AsyncIterable<TFeature>): Promise<void>;
  update(
    id: number,
    changes: {
      geometry?: TFeature["geometry"];
      attributes?: Partial<TFeature["attributes"]>;
    }
  ): Promise<void>;
  delete(id: number): Promise<void>;
}

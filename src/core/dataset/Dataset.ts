import type { DatasetInfo, Feature, FieldInfo, QueryOptions } from "../types";

export interface DatasetInfoProvider {
  readonly info: DatasetInfo;
  getFields(): Promise<readonly FieldInfo[]>;
}

export interface Dataset<TFeature extends Feature = Feature>
  extends DatasetInfoProvider {}

export interface ReadableDataset<TFeature extends Feature = Feature>
  extends Dataset<TFeature> {
  getById(id: number): Promise<TFeature | null>;
  list(options?: QueryOptions): Promise<readonly TFeature[]>;
  iterate(options?: QueryOptions): AsyncIterable<TFeature>;
}

export interface WritableDataset<TFeature extends Feature = Feature>
  extends ReadableDataset<TFeature> {
  insert(feature: TFeature): Promise<void>;
  insertMany(features: Iterable<TFeature> | AsyncIterable<TFeature>): Promise<void>;
}

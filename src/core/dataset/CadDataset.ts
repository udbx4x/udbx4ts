import type { SqlDriver } from "../sql/SqlDriver";
import type { CadGeometry, DatasetInfo, QueryOptions } from "../types";
import { BaseDataset } from "./BaseDataset";
import type { WritableDataset } from "./Dataset";
import { createNotImplementedError } from "../utils/errors";

export type CadFeature<
  TAttributes extends Record<string, unknown> = Record<string, unknown>
> = {
  readonly id: number;
  readonly geometry: CadGeometry;
  readonly attributes: TAttributes;
};

export class CadDataset<
    TAttributes extends Record<string, unknown> = Record<string, unknown>
  >
  extends BaseDataset
  implements WritableDataset<CadFeature<TAttributes>>
{
  async getById(): Promise<CadFeature<TAttributes> | null> {
    throw createNotImplementedError("CadDataset.getById");
  }

  async list(): Promise<readonly CadFeature<TAttributes>[]> {
    throw createNotImplementedError("CadDataset.list");
  }

  async *iterate(): AsyncIterable<CadFeature<TAttributes>> {
    throw createNotImplementedError("CadDataset.iterate");
  }

  async count(): Promise<number> {
    throw createNotImplementedError("CadDataset.count");
  }

  async insert(): Promise<void> {
    throw createNotImplementedError("CadDataset.insert");
  }

  async insertMany(): Promise<void> {
    throw createNotImplementedError("CadDataset.insertMany");
  }

  async update(): Promise<void> {
    throw createNotImplementedError("CadDataset.update");
  }

  async delete(): Promise<void> {
    throw createNotImplementedError("CadDataset.delete");
  }
}

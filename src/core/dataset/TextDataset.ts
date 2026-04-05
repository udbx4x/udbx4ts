import type { SqlDriver } from "../sql/SqlDriver";
import type { DatasetInfo, QueryOptions, TextGeometry } from "../types";
import { BaseDataset } from "./BaseDataset";
import type { WritableDataset } from "./Dataset";
import { createNotImplementedError } from "../utils/errors";

export type TextFeature<
  TAttributes extends Record<string, unknown> = Record<string, unknown>
> = {
  readonly id: number;
  readonly geometry: TextGeometry;
  readonly attributes: TAttributes;
};

/**
 * 文本数据集实现（DatasetKind="text"）。
 *
 * <p>对应白皮书 §3.1.5（文本数据集）。
 *
 * <p><b>TODO:</b> GeoText 二进制编解码器待实现。
 */
export class TextDataset<
    TAttributes extends Record<string, unknown> = Record<string, unknown>
  >
  extends BaseDataset
  implements WritableDataset<TextFeature<TAttributes>>
{
  async getById(): Promise<TextFeature<TAttributes> | null> {
    throw createNotImplementedError("TextDataset.getById");
  }

  async list(
    _options?: QueryOptions
  ): Promise<readonly TextFeature<TAttributes>[]> {
    throw createNotImplementedError("TextDataset.list");
  }

  async *iterate(
    _options?: QueryOptions
  ): AsyncIterable<TextFeature<TAttributes>> {
    throw createNotImplementedError("TextDataset.iterate");
  }

  async count(): Promise<number> {
    throw createNotImplementedError("TextDataset.count");
  }

  async insert(): Promise<void> {
    throw createNotImplementedError("TextDataset.insert");
  }

  async insertMany(): Promise<void> {
    throw createNotImplementedError("TextDataset.insertMany");
  }

  async update(): Promise<void> {
    throw createNotImplementedError("TextDataset.update");
  }

  async delete(): Promise<void> {
    throw createNotImplementedError("TextDataset.delete");
  }
}

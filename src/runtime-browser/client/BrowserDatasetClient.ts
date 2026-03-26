import { RPC_METHODS } from "../../shared-runtime/rpc/methods";
import type { RuntimeTransport } from "../../shared-runtime/transport";
import type {
  DatasetInfo,
  Feature,
  FieldInfo,
  QueryOptions
} from "../../core/types";
import type { WritableDataset } from "../../core/dataset/Dataset";

interface DatasetMethodParams {
  readonly datasetName: string;
}

export class BrowserDatasetClient<
    TFeature extends Feature = Feature
  >
  implements WritableDataset<TFeature>
{
  constructor(
    private readonly transport: RuntimeTransport,
    readonly info: DatasetInfo
  ) {}

  async getFields(): Promise<readonly FieldInfo[]> {
    return this.transport.request<readonly FieldInfo[], DatasetMethodParams>(
      RPC_METHODS.datasetGetFields,
      { datasetName: this.info.name }
    );
  }

  async getById(id: number): Promise<TFeature | null> {
    return this.transport.request<
      TFeature | null,
      DatasetMethodParams & { readonly id: number }
    >(RPC_METHODS.datasetGetById, { datasetName: this.info.name, id });
  }

  async list(options?: QueryOptions): Promise<readonly TFeature[]> {
    const params =
      options === undefined
        ? { datasetName: this.info.name }
        : { datasetName: this.info.name, options };

    return this.transport.request<
      readonly TFeature[],
      DatasetMethodParams & { readonly options?: QueryOptions }
    >(RPC_METHODS.datasetList, params);
  }

  async *iterate(options?: QueryOptions): AsyncIterable<TFeature> {
    const rows = await this.list(options);
    for (const row of rows) {
      yield row;
    }
  }

  async insert(feature: TFeature): Promise<void> {
    await this.transport.request<void, DatasetMethodParams & { readonly feature: TFeature }>(
      RPC_METHODS.datasetInsert,
      { datasetName: this.info.name, feature }
    );
  }

  async insertMany(
    features: Iterable<TFeature> | AsyncIterable<TFeature>
  ): Promise<void> {
    const buffer: TFeature[] = [];

    for await (const feature of features) {
      buffer.push(feature);
    }

    await this.transport.request<
      void,
      DatasetMethodParams & { readonly features: readonly TFeature[] }
    >(RPC_METHODS.datasetInsertMany, {
      datasetName: this.info.name,
      features: buffer
    });
  }
}

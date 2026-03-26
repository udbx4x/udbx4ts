import type { UdbxRuntime } from "../../core/datasource/UdbxDataSource";
import type { Dataset } from "../../core/dataset/Dataset";
import type { DatasetInfo, FieldInfo } from "../../core/types";
import { RPC_METHODS } from "../../shared-runtime/rpc/methods";
import type { RuntimeTransport } from "../../shared-runtime/transport";
import { BrowserDatasetClient } from "./BrowserDatasetClient";

export interface BrowserUdbxClientOptions {
  readonly preferOpfs?: boolean;
}

export interface BrowserImportOptions {
  readonly preferOpfs?: boolean;
}

export class BrowserUdbxClient {
  readonly runtime: UdbxRuntime;

  private constructor(
    private readonly transport: RuntimeTransport,
    runtime: UdbxRuntime
  ) {
    this.runtime = runtime;
  }

  static async connect(
    transport: RuntimeTransport,
    options: BrowserUdbxClientOptions = {}
  ): Promise<BrowserUdbxClient> {
    const response = await transport.request<{ runtime: UdbxRuntime }, BrowserUdbxClientOptions>(
      RPC_METHODS.udbxOpen,
      options
    );

    return new BrowserUdbxClient(transport, response.runtime);
  }

  async listDatasets(): Promise<readonly DatasetInfo[]> {
    return this.transport.request<readonly DatasetInfo[]>(RPC_METHODS.udbxListDatasets);
  }

  async getDataset(name: string): Promise<Dataset | null> {
    const info = await this.transport.request<
      DatasetInfo | null,
      { readonly name: string }
    >(RPC_METHODS.udbxGetDatasetInfo, { name });

    if (!info) {
      return null;
    }

    return new BrowserDatasetClient(this.transport, info);
  }

  async createPointDataset(
    name: string,
    srid: number,
    fields?: readonly FieldInfo[]
  ): Promise<Dataset> {
    return this.createDatasetByMethod(RPC_METHODS.udbxCreatePointDataset, name, srid, fields);
  }

  async createLineDataset(
    name: string,
    srid: number,
    fields?: readonly FieldInfo[]
  ): Promise<Dataset> {
    return this.createDatasetByMethod(RPC_METHODS.udbxCreateLineDataset, name, srid, fields);
  }

  async createRegionDataset(
    name: string,
    srid: number,
    fields?: readonly FieldInfo[]
  ): Promise<Dataset> {
    return this.createDatasetByMethod(RPC_METHODS.udbxCreateRegionDataset, name, srid, fields);
  }

  async close(): Promise<void> {
    await this.transport.request<void>(RPC_METHODS.udbxClose);
    await this.transport.close();
  }

  async exportDatabase(): Promise<Uint8Array> {
    return this.transport.request<Uint8Array>(RPC_METHODS.udbxExportDatabase);
  }

  async importDatabase(
    binary: Uint8Array,
    options: BrowserImportOptions = {}
  ): Promise<void> {
    const params =
      options.preferOpfs === undefined
        ? { binary }
        : { binary, preferOpfs: options.preferOpfs };
    await this.transport.request<void, { readonly binary: Uint8Array; readonly preferOpfs?: boolean }>(
      RPC_METHODS.udbxImportDatabase,
      params
    );
  }

  private async createDatasetByMethod(
    method: string,
    name: string,
    srid: number,
    fields?: readonly FieldInfo[]
  ): Promise<Dataset> {
    const params = {
      name,
      srid,
      ...(fields === undefined ? {} : { fields })
    };

    const info = await this.transport.request<
      DatasetInfo,
      {
        readonly name: string;
        readonly srid: number;
        readonly fields?: readonly FieldInfo[];
      }
    >(method, params);

    return new BrowserDatasetClient(this.transport, info);
  }
}

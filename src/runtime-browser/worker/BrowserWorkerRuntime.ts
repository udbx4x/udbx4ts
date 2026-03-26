import type { UdbxDataSource } from "../../core/datasource/UdbxDataSource";
import type { Dataset } from "../../core/dataset/Dataset";
import type { FieldInfo, FieldType } from "../../core/types";
import { RPC_METHODS } from "../../shared-runtime/rpc/methods";
import type {
  RuntimeFailure,
  RuntimeRequest,
  RuntimeResponse,
  RuntimeSuccess
} from "../../shared-runtime/rpc/protocol";

interface OpenParams {
  readonly preferOpfs?: boolean;
}

interface ImportParams extends OpenParams {
  readonly binary: Uint8Array | readonly number[];
}

interface DatasetNameParams {
  readonly datasetName: string;
}

interface DatasetGetByIdParams extends DatasetNameParams {
  readonly id: number;
}

interface DatasetListParams extends DatasetNameParams {
  readonly options?: unknown;
}

interface DatasetInsertParams extends DatasetNameParams {
  readonly feature: unknown;
}

interface DatasetInsertManyParams extends DatasetNameParams {
  readonly features: readonly unknown[];
}

interface CreateDatasetParams {
  readonly name: string;
  readonly srid: number;
  readonly fields?: readonly unknown[];
}

export interface BrowserWorkerRuntimeOptions {
  readonly createDataSource: (params: OpenParams) => Promise<UdbxDataSource>;
  readonly replaceDataSource?: (params: ImportParams) => Promise<UdbxDataSource>;
}

interface ExportableDataSource extends UdbxDataSource {
  __exportDatabase?: () => Promise<Uint8Array>;
}

interface DatasetReadableShape {
  getFields: () => Promise<readonly unknown[]>;
  getById: (id: number) => Promise<unknown | null>;
  list: (options?: unknown) => Promise<readonly unknown[]>;
}

interface DatasetWritableShape extends DatasetReadableShape {
  insert: (feature: unknown) => Promise<void>;
  insertMany: (features: readonly unknown[]) => Promise<void>;
}

function asReadableDataset(dataset: Dataset): DatasetReadableShape {
  return dataset as unknown as DatasetReadableShape;
}

function asWritableDataset(dataset: Dataset): DatasetWritableShape {
  return dataset as unknown as DatasetWritableShape;
}

function createSuccess<TResult>(
  id: string,
  result: TResult
): RuntimeSuccess<TResult> {
  return { id, ok: true, result };
}

function createFailure(
  id: string,
  code: string,
  message: string
): RuntimeFailure {
  return {
    id,
    ok: false,
    error: { code, message }
  };
}

function asObject(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null) {
    return value as Record<string, unknown>;
  }
  return {};
}

function parseDatasetName(params: unknown): string | null {
  const value = asObject(params).datasetName;
  return typeof value === "string" && value.length > 0 ? value : null;
}

const VALID_FIELD_TYPES = new Set<FieldType>([
  "boolean",
  "int16",
  "int32",
  "int64",
  "float",
  "double",
  "string",
  "date",
  "binary"
]);

export class BrowserWorkerRuntime {
  private dataSource: UdbxDataSource | null = null;

  constructor(private readonly options: BrowserWorkerRuntimeOptions) {}

  async handle(request: RuntimeRequest): Promise<RuntimeResponse> {
    try {
      return await this.dispatch(request);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unexpected runtime error.";
      return createFailure(request.id, "internal_error", message);
    }
  }

  private async dispatch(request: RuntimeRequest): Promise<RuntimeResponse> {
    switch (request.method) {
      case RPC_METHODS.udbxOpen:
        return this.open(request as RuntimeRequest<OpenParams>);
      case RPC_METHODS.udbxClose:
        return this.close(request.id);
      case RPC_METHODS.udbxListDatasets:
        return this.listDatasets(request.id);
      case RPC_METHODS.udbxGetDatasetInfo:
        return this.getDatasetInfo(request as RuntimeRequest<{ readonly name: string }>);
      case RPC_METHODS.udbxExportDatabase:
        return this.exportDatabase(request.id);
      case RPC_METHODS.udbxImportDatabase:
        return this.importDatabase(request as RuntimeRequest<ImportParams>);
      case RPC_METHODS.udbxCreatePointDataset:
        return this.createPointDataset(request as RuntimeRequest<CreateDatasetParams>);
      case RPC_METHODS.udbxCreateLineDataset:
        return this.createLineDataset(request as RuntimeRequest<CreateDatasetParams>);
      case RPC_METHODS.udbxCreateRegionDataset:
        return this.createRegionDataset(request as RuntimeRequest<CreateDatasetParams>);
      case RPC_METHODS.datasetGetFields:
        return this.getFields(request as RuntimeRequest<DatasetNameParams>);
      case RPC_METHODS.datasetGetById:
        return this.getById(request as RuntimeRequest<DatasetGetByIdParams>);
      case RPC_METHODS.datasetList:
        return this.listRows(request as RuntimeRequest<DatasetListParams>);
      case RPC_METHODS.datasetInsert:
        return this.insert(request as RuntimeRequest<DatasetInsertParams>);
      case RPC_METHODS.datasetInsertMany:
        return this.insertMany(request as RuntimeRequest<DatasetInsertManyParams>);
      default:
        return createFailure(
          request.id,
          "unsupported_method",
          `Unsupported RPC method: ${request.method}`
        );
    }
  }

  private async open(request: RuntimeRequest<OpenParams>): Promise<RuntimeResponse> {
    if (this.dataSource) {
      await this.dataSource.close();
      this.dataSource = null;
    }

    const params = request.params ?? {};
    this.dataSource = await this.options.createDataSource(params);

    return createSuccess(request.id, { runtime: this.dataSource.runtime });
  }

  private async close(id: string): Promise<RuntimeResponse> {
    if (this.dataSource) {
      await this.dataSource.close();
      this.dataSource = null;
    }

    return createSuccess(id, undefined);
  }

  private async listDatasets(id: string): Promise<RuntimeResponse> {
    const ds = this.requireDataSource(id);
    if (!ds) {
      return createFailure(id, "not_open", "Datasource has not been opened.");
    }

    const rows = await ds.listDatasets();
    return createSuccess(id, rows);
  }

  private async getDatasetInfo(
    request: RuntimeRequest<{ readonly name: string }>
  ): Promise<RuntimeResponse> {
    const ds = this.requireDataSource(request.id);
    if (!ds) {
      return createFailure(
        request.id,
        "not_open",
        "Datasource has not been opened."
      );
    }

    const name = asObject(request.params).name;
    if (typeof name !== "string" || name.length === 0) {
      return createFailure(
        request.id,
        "invalid_params",
        "Dataset name is required."
      );
    }

    const dataset = await ds.getDataset(name);
    return createSuccess(request.id, dataset?.info ?? null);
  }

  private async exportDatabase(id: string): Promise<RuntimeResponse> {
    const ds = this.requireDataSource(id) as ExportableDataSource | null;
    if (!ds) {
      return createFailure(id, "not_open", "Datasource has not been opened.");
    }

    if (typeof ds.__exportDatabase !== "function") {
      return createFailure(
        id,
        "unsupported_operation",
        "Current runtime does not support database export."
      );
    }

    const binary = await ds.__exportDatabase();
    return createSuccess(id, binary);
  }

  private async importDatabase(
    request: RuntimeRequest<ImportParams>
  ): Promise<RuntimeResponse> {
    if (typeof this.options.replaceDataSource !== "function") {
      return createFailure(
        request.id,
        "unsupported_operation",
        "Current runtime does not support database import."
      );
    }

    const params = asObject(request.params);
    const binaryRaw = params.binary;
    let binary: Uint8Array;

    if (binaryRaw instanceof Uint8Array) {
      binary = binaryRaw;
    } else if (Array.isArray(binaryRaw)) {
      binary = new Uint8Array(binaryRaw);
    } else {
      return createFailure(
        request.id,
        "invalid_params",
        "`binary` must be a Uint8Array or byte array."
      );
    }

    const preferOpfs =
      typeof params.preferOpfs === "boolean" ? params.preferOpfs : undefined;

    if (this.dataSource) {
      await this.dataSource.close();
      this.dataSource = null;
    }

    this.dataSource = await this.options.replaceDataSource({
      binary,
      ...(preferOpfs === undefined ? {} : { preferOpfs })
    });

    return createSuccess(request.id, { runtime: this.dataSource.runtime });
  }

  private async createPointDataset(
    request: RuntimeRequest<CreateDatasetParams>
  ): Promise<RuntimeResponse> {
    const ds = this.requireDataSource(request.id);
    if (!ds) {
      return createFailure(
        request.id,
        "not_open",
        "Datasource has not been opened."
      );
    }

    const parsed = this.parseCreateDatasetParams(request);
    if ("error" in parsed) {
      return parsed.error;
    }

    const dataset = await ds.createPointDataset(
      parsed.params.name,
      parsed.params.srid,
      parsed.params.fields
    );
    return createSuccess(request.id, dataset.info);
  }

  private async createLineDataset(
    request: RuntimeRequest<CreateDatasetParams>
  ): Promise<RuntimeResponse> {
    const ds = this.requireDataSource(request.id);
    if (!ds) {
      return createFailure(
        request.id,
        "not_open",
        "Datasource has not been opened."
      );
    }

    const parsed = this.parseCreateDatasetParams(request);
    if ("error" in parsed) {
      return parsed.error;
    }

    const dataset = await ds.createLineDataset(
      parsed.params.name,
      parsed.params.srid,
      parsed.params.fields
    );
    return createSuccess(request.id, dataset.info);
  }

  private async createRegionDataset(
    request: RuntimeRequest<CreateDatasetParams>
  ): Promise<RuntimeResponse> {
    const ds = this.requireDataSource(request.id);
    if (!ds) {
      return createFailure(
        request.id,
        "not_open",
        "Datasource has not been opened."
      );
    }

    const parsed = this.parseCreateDatasetParams(request);
    if ("error" in parsed) {
      return parsed.error;
    }

    const dataset = await ds.createRegionDataset(
      parsed.params.name,
      parsed.params.srid,
      parsed.params.fields
    );
    return createSuccess(request.id, dataset.info);
  }

  private async getFields(
    request: RuntimeRequest<DatasetNameParams>
  ): Promise<RuntimeResponse> {
    const dataset = await this.requireDataset(request);
    if ("error" in dataset) {
      return dataset.error;
    }

    const readable = asReadableDataset(dataset.dataset);
    const fields = await readable.getFields();
    return createSuccess(request.id, fields);
  }

  private async getById(
    request: RuntimeRequest<DatasetGetByIdParams>
  ): Promise<RuntimeResponse> {
    const dataset = await this.requireDataset(request);
    if ("error" in dataset) {
      return dataset.error;
    }

    const id = asObject(request.params).id;
    if (typeof id !== "number") {
      return createFailure(request.id, "invalid_params", "Feature id is required.");
    }

    const readable = asReadableDataset(dataset.dataset);
    const row = await readable.getById(id);
    return createSuccess(request.id, row);
  }

  private async listRows(
    request: RuntimeRequest<DatasetListParams>
  ): Promise<RuntimeResponse> {
    const dataset = await this.requireDataset(request);
    if ("error" in dataset) {
      return dataset.error;
    }

    const params = asObject(request.params);
    const options =
      "options" in params && params.options !== undefined ? params.options : undefined;
    const readable = asReadableDataset(dataset.dataset);
    const rows = await readable.list(options);
    return createSuccess(request.id, rows);
  }

  private async insert(
    request: RuntimeRequest<DatasetInsertParams>
  ): Promise<RuntimeResponse> {
    const dataset = await this.requireDataset(request);
    if ("error" in dataset) {
      return dataset.error;
    }

    const writable = asWritableDataset(dataset.dataset);
    if (typeof writable.insert !== "function") {
      return createFailure(
        request.id,
        "not_writable",
        `Dataset "${dataset.dataset.info.name}" is not writable.`
      );
    }

    const feature = asObject(request.params).feature;
    await writable.insert(feature);
    return createSuccess(request.id, undefined);
  }

  private async insertMany(
    request: RuntimeRequest<DatasetInsertManyParams>
  ): Promise<RuntimeResponse> {
    const dataset = await this.requireDataset(request);
    if ("error" in dataset) {
      return dataset.error;
    }

    const writable = asWritableDataset(dataset.dataset);
    if (typeof writable.insertMany !== "function") {
      return createFailure(
        request.id,
        "not_writable",
        `Dataset "${dataset.dataset.info.name}" is not writable.`
      );
    }

    const features = asObject(request.params).features;
    if (!Array.isArray(features)) {
      return createFailure(
        request.id,
        "invalid_params",
        "`features` must be an array."
      );
    }

    await writable.insertMany(features);
    return createSuccess(request.id, undefined);
  }

  private requireDataSource(id: string): UdbxDataSource | null {
    if (!this.dataSource) {
      return null;
    }

    return this.dataSource;
  }

  private async requireDataset(
    request: RuntimeRequest<DatasetNameParams>
  ): Promise<{ dataset: Dataset } | { error: RuntimeFailure }> {
    const ds = this.requireDataSource(request.id);
    if (!ds) {
      return {
        error: createFailure(
          request.id,
          "not_open",
          "Datasource has not been opened."
        )
      };
    }

    const datasetName = parseDatasetName(request.params);
    if (!datasetName) {
      return {
        error: createFailure(
          request.id,
          "invalid_params",
          "Dataset name is required."
        )
      };
    }

    const dataset = await ds.getDataset(datasetName);
    if (!dataset) {
      return {
        error: createFailure(
          request.id,
          "dataset_not_found",
          `Dataset "${datasetName}" does not exist.`
        )
      };
    }

    return { dataset };
  }

  private parseCreateDatasetParams(
    request: RuntimeRequest<CreateDatasetParams>
  ):
    | {
        params: {
          readonly name: string;
          readonly srid: number;
          readonly fields?: readonly FieldInfo[];
        };
      }
    | { error: RuntimeFailure } {
    const params = asObject(request.params);
    const name = params.name;
    const srid = params.srid;

    if (typeof name !== "string" || name.length === 0) {
      return {
        error: createFailure(
          request.id,
          "invalid_params",
          "Dataset name is required."
        )
      };
    }

    if (typeof srid !== "number") {
      return {
        error: createFailure(request.id, "invalid_params", "Dataset SRID is required.")
      };
    }

    const fields = params.fields;
    const parsedFields = this.parseFieldInfos(request.id, fields);
    if ("error" in parsedFields) {
      return parsedFields;
    }

    return {
      params: {
        name,
        srid,
        ...(parsedFields.fields === undefined ? {} : { fields: parsedFields.fields })
      }
    };
  }

  private parseFieldInfos(
    id: string,
    fields: unknown
  ):
    | { fields?: readonly FieldInfo[] }
    | {
        error: RuntimeFailure;
      } {
    if (fields === undefined) {
      return {};
    }

    if (!Array.isArray(fields)) {
      return {
        error: createFailure(id, "invalid_params", "`fields` must be an array when provided.")
      };
    }

    const parsed: FieldInfo[] = [];
    for (const item of fields) {
      const row = asObject(item);
      const name = row.name;
      const fieldType = row.fieldType;
      const nullable = row.nullable;

      if (typeof name !== "string" || name.length === 0) {
        return {
          error: createFailure(id, "invalid_params", "Field name is required.")
        };
      }

      if (typeof fieldType !== "string" || !VALID_FIELD_TYPES.has(fieldType as FieldType)) {
        return {
          error: createFailure(id, "invalid_params", `Unsupported field type: ${String(fieldType)}`)
        };
      }

      if (typeof nullable !== "boolean") {
        return {
          error: createFailure(id, "invalid_params", "Field nullable flag is required.")
        };
      }

      if ("defaultValue" in row) {
        parsed.push({
          name,
          fieldType: fieldType as FieldType,
          nullable,
          defaultValue: row.defaultValue
        });
        continue;
      }

      parsed.push({
        name,
        fieldType: fieldType as FieldType,
        nullable
      });
    }

    return { fields: parsed };
  }
}

export interface WorkerHost {
  postMessage(message: RuntimeResponse): void;
}

export function createWorkerMessageHandler(
  runtime: BrowserWorkerRuntime,
  host: WorkerHost
): (event: { data: unknown }) => Promise<void> {
  return async (event): Promise<void> => {
    const data = event.data;

    if (typeof data !== "object" || data === null) {
      return;
    }

    if (!("id" in data) || !("method" in data)) {
      return;
    }

    const response = await runtime.handle(data as RuntimeRequest);
    host.postMessage(response);
  };
}

import type { UdbxDataSource } from "../core/datasource/UdbxDataSource";
import { BrowserUdbxClient } from "./client/BrowserUdbxClient";
import {
  BrowserWorkerTransport,
  type WorkerLike
} from "./client/BrowserWorkerTransport";
export { BrowserSqliteDriver } from "./sqlite/BrowserSqliteDriver";
export type {
  BrowserSqlBindable,
  BrowserSqliteAdapter,
  BrowserSqliteConnectionAdapter,
  BrowserSqliteStatementAdapter
} from "./sqlite/BrowserSqliteDriver";
export {
  createSqliteWasmAdapter
} from "./sqlite/createSqliteWasmAdapter";
export type { SqliteWasmAdapterOptions } from "./sqlite/createSqliteWasmAdapter";
export {
  isOpfsAvailable,
  resolveBrowserSqlOpenTarget
} from "./sqlite/resolveBrowserSqlOpenTarget";
export type {
  BrowserRuntimeCapabilities,
  BrowserSqlOpenTargetOptions
} from "./sqlite/resolveBrowserSqlOpenTarget";
export { createBrowserWorkerRuntime } from "./worker/createBrowserWorkerRuntime";
export {
  installBrowserWorkerRuntime,
  installDefaultBrowserWorkerRuntime,
  installSqliteWasmWorkerRuntime
} from "./worker";
export type { InstallSqliteWasmWorkerRuntimeOptions } from "./worker";
export {
  createUdbxBlob,
  downloadBinaryFile,
  readBlobAsUint8Array,
  saveBinaryWithPickerOrDownload,
  supportsFileSystemAccess,
  writeBinaryToFileHandle
} from "./fs/browserFileIO";
export {
  downloadUdbxFile,
  exportUdbxToBlob,
  importUdbxFromFile,
  saveUdbxWithPickerOrDownload,
  saveUdbxToFileHandle
} from "./fs/browserWorkspace";

export interface BrowserUdbxOptions {
  readonly workerUrl?: string;
  readonly preferOpfs?: boolean;
  readonly workerFactory?: () => WorkerLike;
}

export type BrowserUdbxDataSource = UdbxDataSource & {
  exportDatabase(): Promise<Uint8Array>;
  importDatabase(binary: Uint8Array, options?: { preferOpfs?: boolean }): Promise<void>;
};

function resolveWorker(options: BrowserUdbxOptions): WorkerLike {
  if (options.workerFactory) {
    return options.workerFactory();
  }

  if (!options.workerUrl) {
    throw new Error(
      "Browser worker URL is required. Provide `workerUrl` or `workerFactory`."
    );
  }

  if (typeof Worker === "undefined") {
    throw new Error("Worker API is unavailable in this environment.");
  }

  return new Worker(options.workerUrl, { type: "module" }) as unknown as WorkerLike;
}

export async function createBrowserUdbx(
  options: BrowserUdbxOptions = {}
): Promise<BrowserUdbxDataSource> {
  const worker = resolveWorker(options);
  const transport = new BrowserWorkerTransport(worker);
  const connectOptions =
    options.preferOpfs === undefined
      ? {}
      : { preferOpfs: options.preferOpfs };
  const client = await BrowserUdbxClient.connect(transport, {
    ...connectOptions
  });

  return client as unknown as BrowserUdbxDataSource;
}

import { BrowserSqliteDriver } from "../sqlite/BrowserSqliteDriver";
import {
  createSqliteWasmAdapter,
  type SqliteWasmAdapterOptions
} from "../sqlite/createSqliteWasmAdapter";
import { createWorkerMessageHandler } from "./BrowserWorkerRuntime";
import { createBrowserWorkerRuntime } from "./createBrowserWorkerRuntime";

export interface WorkerGlobalLike {
  addEventListener(
    type: "message",
    listener: (event: { data: unknown }) => void
  ): void;
  postMessage(message: unknown): void;
}

export interface InstallSqliteWasmWorkerRuntimeOptions {
  readonly sqlite?: SqliteWasmAdapterOptions;
  readonly openTarget?: {
    readonly opfsPath?: string;
    readonly memoryName?: string;
  };
}

export function installSqliteWasmWorkerRuntime(
  globalScope: WorkerGlobalLike,
  options: InstallSqliteWasmWorkerRuntimeOptions = {}
): void {
  const runtime = createBrowserWorkerRuntime({
    createDriver: () => new BrowserSqliteDriver(createSqliteWasmAdapter(options.sqlite)),
    ...(options.openTarget === undefined ? {} : { openTarget: options.openTarget })
  });
  const handler = createWorkerMessageHandler(runtime, {
    postMessage: (message) => globalScope.postMessage(message)
  });

  globalScope.addEventListener("message", (event) => {
    void handler(event);
  });
}

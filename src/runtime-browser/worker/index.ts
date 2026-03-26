import { BrowserWorkerRuntime, createWorkerMessageHandler } from "./BrowserWorkerRuntime";
import {
  createBrowserWorkerRuntime,
  type CreateBrowserWorkerRuntimeOptions
} from "./createBrowserWorkerRuntime";
export { createBrowserWorkerRuntime } from "./createBrowserWorkerRuntime";
export {
  installSqliteWasmWorkerRuntime,
  type InstallSqliteWasmWorkerRuntimeOptions
} from "./installSqliteWasmWorkerRuntime";

export interface WorkerGlobalLike {
  addEventListener(
    type: "message",
    listener: (event: { data: unknown }) => void
  ): void;
  postMessage(message: unknown): void;
}

export function installBrowserWorkerRuntime(
  globalScope: WorkerGlobalLike,
  runtime: BrowserWorkerRuntime
): void {
  const handler = createWorkerMessageHandler(runtime, {
    postMessage: (message) => globalScope.postMessage(message)
  });

  globalScope.addEventListener("message", (event) => {
    void handler(event);
  });
}

export function installDefaultBrowserWorkerRuntime(
  globalScope: WorkerGlobalLike,
  options: CreateBrowserWorkerRuntimeOptions
): BrowserWorkerRuntime {
  const runtime = createBrowserWorkerRuntime(options);
  installBrowserWorkerRuntime(globalScope, runtime);
  return runtime;
}

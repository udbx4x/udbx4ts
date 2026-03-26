import { installSqliteWasmWorkerRuntime } from "../../src/runtime-browser";

installSqliteWasmWorkerRuntime(self, {
  openTarget: {
    opfsPath: "udbx/workspace.udbx",
    memoryName: "udbx-fallback"
  }
});

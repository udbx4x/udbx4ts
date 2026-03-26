# Browser Example

浏览器示例正在逐步落地，目前已经具备 worker 侧 sqlite-wasm 运行时安装入口：

- `installSqliteWasmWorkerRuntime(...)`
- `installDefaultBrowserWorkerRuntime(...)`
- `createBrowserUdbx(...)`

建议 worker 入口（示例）：

```ts
import { installSqliteWasmWorkerRuntime } from "udbx4ts/web";

installSqliteWasmWorkerRuntime(self, {
  openTarget: {
    opfsPath: "udbx/workspace.udbx",
    memoryName: "udbx-fallback"
  }
});
```

当前目录仍用于持续补齐：

- Worker 装载示例
- `.udbx` 文件导入导出示例
- OPFS 与 fallback 模式演示

已提供初版示例文件：

- [main.ts](/Users/zhangyuting/github/zhyt1985/udbx4ts/examples/browser/main.ts)
- [worker.ts](/Users/zhangyuting/github/zhyt1985/udbx4ts/examples/browser/worker.ts)
- [index.html](/Users/zhangyuting/github/zhyt1985/udbx4ts/examples/browser/index.html)
- [vite.config.ts](/Users/zhangyuting/github/zhyt1985/udbx4ts/examples/browser/vite.config.ts)

本地运行：

```bash
npm install
npm run dev:browser
```

打开终端输出的本地地址（默认 [http://localhost:5173](http://localhost:5173)）。

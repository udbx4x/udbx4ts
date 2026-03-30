# Browser Example

使用 `udbx4ts/web` 在浏览器中读写 UDBX 空间数据库。

## 快速开始

```bash
# 从项目根目录
pnpm install
pnpm dev:browser
```

打开终端输出的本地地址（默认 http://localhost:5173）。

## 架构

```
主线程 (main.ts)
  ↕ Worker postMessage (RPC)
Worker (worker.ts)
  ↕ sql.js WASM
OPFS / 内存数据库
```

- **Worker**：通过 `installSqliteWasmWorkerRuntime()` 安装 RPC 运行时，使用 sql.js WASM 访问 SQLite
- **主线程**：通过 `createBrowserUdbx(worker)` 获取 `UdbxDataSource` 代理，API 与直接使用一致
- **OPFS**：优先使用 OPFS 持久化存储，不支持时回退到内存数据库

## 关键代码

```typescript
// worker.ts
import { installSqliteWasmWorkerRuntime } from "udbx4ts/web";

installSqliteWasmWorkerRuntime(self, {
  openTarget: {
    opfsPath: "udbx/workspace.udbx",
    memoryName: "udbx-fallback"
  }
});
```

```typescript
// main.ts
import { createBrowserUdbx } from "udbx4ts/web";

const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
const ds = await createBrowserUdbx(worker, { kind: "memory" });
const datasets = await ds.listDatasets();
```

## 文件

- `main.ts` — 主线程入口，创建 Worker 并演示 UDBX 操作
- `worker.ts` — Worker 入口，安装 sql.js 运行时
- `index.html` — 演示页面
- `vite.config.ts` — Vite 构建配置

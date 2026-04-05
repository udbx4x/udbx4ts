# udbx4ts

TypeScript UDBX runtime — 在 Web 浏览器和 Electron 中读写 UDBX 空间数据库。

## 概述

UDBX 是基于 SQLite 的空间数据库格式，兼容 SpatiaLite 的 GAIA 二进制几何编码。`udbx4ts` 提供纯 TypeScript 实现，支持：

- **浏览器**：基于 sql.js (WASM) + OPFS，在 Web Worker 中运行
- **Electron**：基于 better-sqlite3，在主进程中直接访问
- **零外部依赖**（核心层），最小化打包体积

## 功能

| 功能 | 浏览器 | Electron |
|------|--------|----------|
| 打开/创建 UDBX 文件 | OPFS / 内存 | 本地文件 |
| 数据集 CRUD | Point / Line / Region / Tabular / PointZ / LineZ / RegionZ / Cad | Point / Line / Region / Tabular / PointZ / LineZ / RegionZ / Cad |
| 流式读取 (AsyncIterable) | 分页代理 | 原生流式 |
| 批量写入 (prepared statement) | 支持 | 支持 |
| 几何编解码 (GAIA) | Point / MultiLineString / MultiPolygon | Point / MultiLineString / MultiPolygon |

## 安装

```bash
npm install udbx4ts
```

### 浏览器

```typescript
import { createBrowserUdbx } from "udbx4ts/web";
```

浏览器运行时需要 sql.js WASM，通过 `peerDependency` 声明。

### Electron

```typescript
import { createElectronUdbx } from "udbx4ts/electron";
```

Electron 运行时需要 `better-sqlite3`，通过 `peerDependency` 声明。

```bash
npm install better-sqlite3
```

## 快速开始

### 浏览器

1. 创建 Web Worker 并安装运行时：

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

2. 在主线程中使用：

```typescript
// main.ts
import { createBrowserUdbx } from "udbx4ts/web";

const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
const ds = await createBrowserUdbx(worker, { kind: "memory" });

// 创建点数据集
const points = await ds.createPointDataset("cities", 4326, [
  { name: "NAME", fieldType: "string", nullable: true }
]);

// 插入要素
await points.insert({
  id: 1,
  geometry: { type: "Point", coordinates: [116.4, 39.9], srid: 4326 },
  attributes: { NAME: "Beijing" }
});

// 查询
const features = await points.list();
for (const f of features) {
  console.log(f.id, f.geometry.coordinates, f.attributes);
}
```

### Electron

```typescript
// main process
import { createElectronUdbx } from "udbx4ts/electron";

// 打开已有文件
const ds = await createElectronUdbx({ path: "/path/to/file.udbx" });

// 或创建新文件
const ds = await createElectronUdbx({ path: "/path/to/new.udbx" }); // 自动创建

// 使用 API
const datasets = await ds.listDatasets();
const regions = await ds.createRegionDataset("parcels", 4326, [
  { name: "AREA", fieldType: "double", nullable: true }
]);
```

## API 概览

### UdbxDataSource

数据源入口，管理数据集的创建、打开和列举。

```typescript
interface UdbxDataSource {
  listDatasets(): Promise<readonly DatasetInfo[]>;
  getDataset(name: string): Promise<UdbxDataset>;
  createPointDataset(name: string, srid: number, fields?: FieldInfo[]): Promise<PointDataset>;
  createLineDataset(name: string, srid: number, fields?: FieldInfo[]): Promise<LineDataset>;
  createRegionDataset(name: string, srid: number, fields?: FieldInfo[]): Promise<RegionDataset>;
  createPointZDataset(name: string, srid: number, fields?: FieldInfo[]): Promise<PointZDataset>;
  createLineZDataset(name: string, srid: number, fields?: FieldInfo[]): Promise<LineZDataset>;
  createRegionZDataset(name: string, srid: number, fields?: FieldInfo[]): Promise<RegionZDataset>;
  createCadDataset(name: string, srid: number, fields?: FieldInfo[]): Promise<CadDataset>;
  createTabularDataset(name: string, fields?: FieldInfo[]): Promise<TabularDataset>;
  close(): Promise<void>;
}
```

### 数据集类型

| 类型 | 几何 | Feature 类型 |
|------|------|-------------|
| `PointDataset` | Point (GAIA type 1) | `Feature<PointGeometry>` |
| `LineDataset` | MultiLineString (GAIA type 5) | `Feature<MultiLineStringGeometry>` |
| `RegionDataset` | MultiPolygon (GAIA type 6) | `Feature<MultiPolygonGeometry>` |
| `PointZDataset` | Point Z (GAIA type 1 + Z) | `Feature<PointGeometry>` |
| `LineZDataset` | MultiLineString Z (GAIA type 5 + Z) | `Feature<MultiLineStringGeometry>` |
| `RegionZDataset` | MultiPolygon Z (GAIA type 6 + Z) | `Feature<MultiPolygonGeometry>` |
| `CadDataset` | CAD Geometry | `Feature<CadGeometry>` |
| `TabularDataset` | 无几何 | `TabularRecord` |

### 数据集操作

所有数据集支持：

- `getById(id)` — 按 ID 查询单条记录
- `list(options?)` — 列出记录（支持 limit/offset/filter）
- `iterate(options?)` — 异步迭代器，流式读取
- `insert(feature)` — 插入单条记录
- `insertMany(features)` — 批量插入（使用 prepared statement 优化）
- `getFields()` — 获取字段元信息
- `count()` — 获取记录总数
- `update(id, changes)` — 更新记录（所有数据集类型均支持）
- `delete(id)` — 删除记录（所有数据集类型均支持）

### 几何类型

```typescript
interface PointGeometry {
  type: "Point";
  coordinates: [number, number] | [number, number, number];
}

interface MultiLineStringGeometry {
  type: "MultiLineString";
  coordinates: [number, number][][] | [number, number, number][][];
}

interface MultiPolygonGeometry {
  type: "MultiPolygon";
  coordinates: [number, number][][][] | [number, number, number][][][];
}
```

### 字段类型

```typescript
type FieldType = "boolean" | "byte" | "int16" | "int32" | "int64" | "single" | "double" | "date" | "time" | "datetime" | "binary" | "text" | "ntext" | "geometry";

interface FieldInfo {
  name: string;
  fieldType: FieldType;
  nullable: boolean;
  defaultValue?: unknown;
}
```

## 示例

- [`examples/browser/`](./examples/browser/) — 浏览器示例（Vite + Web Worker）
- [`examples/electron/`](./examples/electron/) — Electron 示例（主进程 + IPC）

## 开发

```bash
# 安装依赖
pnpm install

# 运行测试（99 tests）
pnpm test

# 类型检查
pnpm typecheck

# 构建
pnpm build

# 浏览器示例
pnpm dev:browser

# Electron 示例
cd examples/electron && npm start
```

## 架构

```
src/
├── core/                    # 核心层（运行时无关）
│   ├── dataset/             # 数据集实现（Point/Line/Region/Tabular）
│   ├── datasource/          # UdbxDataSource 入口
│   ├── geometry/gaia/       # GAIA 二进制编解码
│   ├── schema/              # UDBX 元数据表（SmRegister/SmFieldInfo）
│   ├── sql/                 # SqlDriver 接口 + SQL helpers
│   └── types/               # 类型定义
├── shared-runtime/          # 共享 RPC 协议
├── runtime-browser/         # 浏览器运行时（sql.js + OPFS + Worker）
└── runtime-electron/        # Electron 运行时（better-sqlite3）
```

## License

Private

## udbx4spec 规范合规

本项目严格遵循 `udbx4spec/` 中定义的跨语言规范。关键约束：

- **API 命名**：所有公开 API 必须与 `udbx4spec/docs/01-naming-conventions.md` 对齐
- **数据模型**：几何模型必须符合 `udbx4spec/docs/02-geometry-model.md`
- **数据集类型**：`DatasetKind` 枚举值必须与 `udbx4spec/docs/03-dataset-taxonomy.md` 同步
- **字段类型**：`FieldType` 枚举值必须与 `udbx4spec/docs/04-field-taxonomy.md` 同步（14 种）
- **变更流程**：任何 API 变更、新增数据集类型或字段类型，必须先在 udbx4spec 中定义，然后在各语言实现中同步

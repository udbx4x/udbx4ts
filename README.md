# udbx4ts

[![npm version](https://img.shields.io/npm/v/udbx4ts.svg)](https://www.npmjs.com/package/udbx4ts)
[![Node.js Version](https://img.shields.io/node/v/udbx4ts.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

> TypeScript UDBX runtime — 在 Web 浏览器和 Electron 中读写 UDBX 空间数据库。

[English](./README.en.md) | 中文

---

## 目录

- [简介](#简介)
- [功能特性](#功能特性)
- [安装](#安装)
- [快速开始](#快速开始)
  - [浏览器环境](#浏览器环境)
  - [Electron 环境](#electron-环境)
- [API 概览](#api-概览)
- [架构](#架构)
- [示例](#示例)
- [开发](#开发)
- [相关项目](#相关项目)
- [许可证](#许可证)

---

## 简介

UDBX（Universal Spatial Database Extension）是基于 SQLite 的空间数据库格式，兼容 SpatiaLite 的 GAIA 二进制几何编码。`udbx4ts` 提供纯 TypeScript 实现，支持在浏览器和 Electron 环境中高效处理空间数据。

**核心特点：**

- 🌐 **双平台支持** — 浏览器（SQLite WASM + OPFS）和 Electron（better-sqlite3）
- 📦 **零依赖核心** — 核心层无外部依赖，最小化打包体积
- 🔧 **类型安全** — 完整的 TypeScript 类型定义
- 🚀 **流式处理** — 支持 AsyncIterable 流式读取大数据集
- 📝 **兼容规范** — 严格遵循 udbx4spec 跨语言规范

---

## 功能特性

| 特性 | 浏览器 | Electron |
|------|--------|----------|
| 打开/创建 UDBX 文件 | ✅ OPFS / 内存 | ✅ 本地文件 |
| 点数据集 (Point/PointZ) | ✅ 读/写 | ✅ 读/写 |
| 线数据集 (Line/LineZ) | ✅ 读/写 | ✅ 读/写 |
| 面数据集 (Region/RegionZ) | ✅ 读/写 | ✅ 读/写 |
| 纯属性表 (Tabular) | ✅ 读/写 | ✅ 读/写 |
| CAD 数据集 | ✅ 读/写 | ✅ 读/写 |
| 流式读取 (AsyncIterable) | ✅ 分页代理 | ✅ 原生流式 |
| 批量写入 | ✅ 事务优化 | ✅ 事务优化 |
| 空间索引 | 🚧 计划中 | 🚧 计划中 |

---

## 安装

```bash
npm install udbx4ts
```

### 浏览器环境

浏览器运行时需要 `@sqlite.org/sqlite-wasm`，已通过 `peerDependency` 声明：

```bash
npm install @sqlite.org/sqlite-wasm
```

### Electron 环境

Electron 运行时需要 `better-sqlite3`：

```bash
npm install better-sqlite3
```

---

## 快速开始

### 浏览器环境

1. **创建 Web Worker**（`worker.ts`）：

```typescript
import { installSqliteWasmWorkerRuntime } from "udbx4ts/web";

installSqliteWasmWorkerRuntime(self, {
  openTarget: {
    opfsPath: "udbx/workspace.udbx",
    memoryName: "udbx-fallback"
  }
});
```

2. **在主线程中使用**（`main.ts`）：

```typescript
import { createBrowserUdbx } from "udbx4ts/web";

// 创建 Worker
const worker = new Worker(
  new URL("./worker.ts", import.meta.url),
  { type: "module" }
);

// 初始化数据源
const ds = await createBrowserUdbx(worker, { kind: "memory" });

// 创建点数据集
const points = await ds.createPointDataset("cities", 4326, [
  { name: "name", fieldType: "text", nullable: false },
  { name: "population", fieldType: "int32", nullable: true }
]);

// 插入要素
await points.insert({
  id: 1,
  geometry: { type: "Point", coordinates: [116.4, 39.9], srid: 4326 },
  attributes: { name: "Beijing", population: 21540000 }
});

// 流式查询
for await (const feature of points.iterate()) {
  console.log(feature.id, feature.geometry.coordinates, feature.attributes);
}

// 关闭连接
await ds.close();
```

### Electron 环境

```typescript
// main process
import { createElectronUdbx } from "udbx4ts/electron";

// 打开已有文件
const ds = await createElectronUdbx({ path: "/path/to/file.udbx" });

// 或创建新文件
const ds = await createElectronUdbx({ path: "/path/to/new.udbx" });

// 创建面数据集
const regions = await ds.createRegionDataset("parcels", 4326, [
  { name: "area", fieldType: "double", nullable: true },
  { name: "owner", fieldType: "text", nullable: false }
]);

// 批量插入
await regions.insertMany([
  {
    id: 1,
    geometry: {
      type: "MultiPolygon",
      coordinates: [[[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]]],
      srid: 4326
    },
    attributes: { area: 1000.5, owner: "Alice" }
  },
  // ... 更多要素
]);

// 查询统计
const count = await regions.count();
console.log(`Total parcels: ${count}`);

await ds.close();
```

---

## API 概览

### UdbxDataSource

数据源入口，管理数据集的创建、打开和列举。

```typescript
interface UdbxDataSource {
  // 数据集管理
  listDatasets(): Promise<readonly DatasetInfo[]>;
  getDataset(name: string): Promise<UdbxDataset | undefined>;
  hasDataset(name: string): Promise<boolean>;

  // 创建数据集
  createPointDataset(name: string, srid: number, fields?: FieldInfo[]): Promise<PointDataset>;
  createLineDataset(name: string, srid: number, fields?: FieldInfo[]): Promise<LineDataset>;
  createRegionDataset(name: string, srid: number, fields?: FieldInfo[]): Promise<RegionDataset>;
  createPointZDataset(name: string, srid: number, fields?: FieldInfo[]): Promise<PointZDataset>;
  createLineZDataset(name: string, srid: number, fields?: FieldInfo[]): Promise<LineZDataset>;
  createRegionZDataset(name: string, srid: number, fields?: FieldInfo[]): Promise<RegionZDataset>;
  createCadDataset(name: string, srid: number, fields?: FieldInfo[]): Promise<CadDataset>;
  createTabularDataset(name: string, fields?: FieldInfo[]): Promise<TabularDataset>;

  // 连接管理
  close(): Promise<void>;
}
```

### 数据集操作

所有数据集支持以下操作：

```typescript
interface ReadableDataset<TFeature> {
  // 查询
  getById(id: number): Promise<TFeature | null>;
  list(options?: QueryOptions): Promise<TFeature[]>;
  iterate(options?: QueryOptions): AsyncIterable<TFeature>;

  // 元数据
  getFields(): Promise<FieldInfo[]>;
  count(): Promise<number>;
  getInfo(): DatasetInfo;
}

interface WritableDataset<TFeature> extends ReadableDataset<TFeature> {
  // 写入
  insert(feature: TFeature): Promise<void>;
  insertMany(features: Iterable<TFeature> | AsyncIterable<TFeature>): Promise<void>;
  update(id: number, changes: Partial<TFeature>): Promise<void>;
  delete(id: number): Promise<void>;
}
```

### 字段类型

支持 14 种标准字段类型：

```typescript
type FieldType =
  | "boolean"   // 布尔值
  | "byte"      // 8位整数
  | "int16"     // 16位整数
  | "int32"     // 32位整数
  | "int64"     // 64位整数
  | "single"    // 单精度浮点
  | "double"    // 双精度浮点
  | "date"      // 日期
  | "time"      // 时间
  | "binary"    // 二进制数据
  | "text"      // 文本
  | "ntext"     // 长文本
  | "char"      // 定长字符
  | "geometry"; // 几何数据
```

---

## 架构

```
src/
├── core/                    # 核心层（平台无关）
│   ├── dataset/             # 数据集实现
│   ├── datasource/          # 数据源入口
│   ├── geometry/            # 几何编解码
│   │   ├── gaia/            # GAIA 二进制编解码
│   │   └── jsts/            # JSTS 适配器
│   ├── schema/              # UDBX 元数据表
│   ├── sql/                 # SQL 驱动抽象
│   └── types/               # 类型定义
├── shared-runtime/          # 共享运行时协议
├── runtime-browser/         # 浏览器运行时
│   ├── client/              # 主线程客户端
│   ├── worker/              # Worker 运行时
│   ├── sqlite/              # SQLite WASM 适配
│   └── fs/                  # OPFS 文件操作
└── runtime-electron/        # Electron 运行时
    └── BetterSqlite3Driver.ts
```

**关键设计原则：**

- **核心层与运行时解耦**：`src/core/` 不依赖任何平台特定 API
- **异步接口统一**：所有公共 API 均为异步，屏蔽平台差异
- **Worker 隔离**：浏览器端数据库操作全部在 Web Worker 中执行
- **事务批量写入**：`insertMany` 使用事务和预处理语句优化性能

---

## 示例

- [`examples/browser/`](./examples/browser/) — 浏览器完整示例（Vite + Web Worker + OPFS）
- [`examples/electron/`](./examples/electron/) — Electron 示例（主进程 + IPC）

---

## 开发

```bash
# 安装依赖
npm install

# 类型检查
npm run typecheck

# 运行测试
npm test

# 浏览器端测试
npm run test:browser

# 构建
npm run build

# 启动浏览器示例
npm run dev:browser
```

---

## 相关项目

- [udbx4j](https://github.com/your-org/udbx4j) — Java 实现，功能完善的参考实现
- [udbx4spec](../udbx4spec/) — 跨语言 API 规范定义

---

## 许可证

[MIT](./LICENSE)

# udbx4ts

[![npm version](https://img.shields.io/npm/v/udbx4ts.svg)](https://www.npmjs.com/package/udbx4ts)
[![Node.js Version](https://img.shields.io/node/v/udbx4ts.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

> TypeScript UDBX runtime — Read and write UDBX spatial databases in Web browsers and Electron.

English | [中文](./README.md)

---

## Table of Contents

- [Introduction](#introduction)
- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
  - [Browser](#browser)
  - [Electron](#electron)
- [API Overview](#api-overview)
- [Architecture](#architecture)
- [Examples](#examples)
- [Development](#development)
- [Related Projects](#related-projects)
- [License](#license)

---

## Introduction

UDBX (Universal Spatial Database Extension) is a SQLite-based spatial database format compatible with SpatiaLite's GAIA binary geometry encoding. `udbx4ts` provides a pure TypeScript implementation for efficient spatial data processing in browser and Electron environments.

**Key Features:**

- 🌐 **Dual Platform** — Browser (SQLite WASM + OPFS) and Electron (better-sqlite3)
- 📦 **Zero-dependency Core** — Core layer has no external dependencies, minimal bundle size
- 🔧 **Type Safe** — Complete TypeScript type definitions
- 🚀 **Streaming** — AsyncIterable streaming for large datasets
- 📝 **Spec Compliant** — Strictly follows udbx4spec cross-language specification

---

## Features

| Feature | Browser | Electron |
|---------|---------|----------|
| Open/Create UDBX files | ✅ OPFS / Memory | ✅ Local files |
| Point datasets (Point/PointZ) | ✅ Read/Write | ✅ Read/Write |
| Line datasets (Line/LineZ) | ✅ Read/Write | ✅ Read/Write |
| Region datasets (Region/RegionZ) | ✅ Read/Write | ✅ Read/Write |
| Tabular datasets | ✅ Read/Write | ✅ Read/Write |
| CAD datasets | ✅ Read/Write | ✅ Read/Write |
| Streaming (AsyncIterable) | ✅ Paged proxy | ✅ Native streaming |
| Bulk insert | ✅ Transaction optimized | ✅ Transaction optimized |
| Spatial index | 🚧 Planned | 🚧 Planned |

---

## Installation

```bash
npm install udbx4ts
```

### Browser

Browser runtime requires `@sqlite.org/sqlite-wasm` (declared as `peerDependency`):

```bash
npm install @sqlite.org/sqlite-wasm
```

### Electron

Electron runtime requires `better-sqlite3`:

```bash
npm install better-sqlite3
```

---

## Quick Start

### Browser

1. **Create Web Worker** (`worker.ts`):

```typescript
import { installSqliteWasmWorkerRuntime } from "udbx4ts/web";

installSqliteWasmWorkerRuntime(self, {
  openTarget: {
    opfsPath: "udbx/workspace.udbx",
    memoryName: "udbx-fallback"
  }
});
```

2. **Use in main thread** (`main.ts`):

```typescript
import { createBrowserUdbx } from "udbx4ts/web";

// Create Worker
const worker = new Worker(
  new URL("./worker.ts", import.meta.url),
  { type: "module" }
);

// Initialize data source
const ds = await createBrowserUdbx(worker, { kind: "memory" });

// Create point dataset
const points = await ds.createPointDataset("cities", 4326, [
  { name: "name", fieldType: "text", nullable: false },
  { name: "population", fieldType: "int32", nullable: true }
]);

// Insert feature
await points.insert({
  id: 1,
  geometry: { type: "Point", coordinates: [116.4, 39.9], srid: 4326 },
  attributes: { name: "Beijing", population: 21540000 }
});

// Streaming query
for await (const feature of points.iterate()) {
  console.log(feature.id, feature.geometry.coordinates, feature.attributes);
}

// Close connection
await ds.close();
```

### Electron

```typescript
// main process
import { createElectronUdbx } from "udbx4ts/electron";

// Open existing file
const ds = await createElectronUdbx({ path: "/path/to/file.udbx" });

// Or create new file
const ds = await createElectronUdbx({ path: "/path/to/new.udbx" });

// Create region dataset
const regions = await ds.createRegionDataset("parcels", 4326, [
  { name: "area", fieldType: "double", nullable: true },
  { name: "owner", fieldType: "text", nullable: false }
]);

// Bulk insert
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
  // ... more features
]);

// Query statistics
const count = await regions.count();
console.log(`Total parcels: ${count}`);

await ds.close();
```

---

## API Overview

### UdbxDataSource

Entry point for data sources, managing dataset creation, opening, and enumeration.

```typescript
interface UdbxDataSource {
  // Dataset management
  listDatasets(): Promise<readonly DatasetInfo[]>;
  getDataset(name: string): Promise<UdbxDataset | undefined>;
  hasDataset(name: string): Promise<boolean>;

  // Create datasets
  createPointDataset(name: string, srid: number, fields?: FieldInfo[]): Promise<PointDataset>;
  createLineDataset(name: string, srid: number, fields?: FieldInfo[]): Promise<LineDataset>;
  createRegionDataset(name: string, srid: number, fields?: FieldInfo[]): Promise<RegionDataset>;
  createPointZDataset(name: string, srid: number, fields?: FieldInfo[]): Promise<PointZDataset>;
  createLineZDataset(name: string, srid: number, fields?: FieldInfo[]): Promise<LineZDataset>;
  createRegionZDataset(name: string, srid: number, fields?: FieldInfo[]): Promise<RegionZDataset>;
  createCadDataset(name: string, srid: number, fields?: FieldInfo[]): Promise<CadDataset>;
  createTabularDataset(name: string, fields?: FieldInfo[]): Promise<TabularDataset>;

  // Connection management
  close(): Promise<void>;
}
```

### Dataset Operations

All datasets support the following operations:

```typescript
interface ReadableDataset<TFeature> {
  // Query
  getById(id: number): Promise<TFeature | null>;
  list(options?: QueryOptions): Promise<TFeature[]>;
  iterate(options?: QueryOptions): AsyncIterable<TFeature>;

  // Metadata
  getFields(): Promise<FieldInfo[]>;
  count(): Promise<number>;
  getInfo(): DatasetInfo;
}

interface WritableDataset<TFeature> extends ReadableDataset<TFeature> {
  // Write
  insert(feature: TFeature): Promise<void>;
  insertMany(features: Iterable<TFeature> | AsyncIterable<TFeature>): Promise<void>;
  update(id: number, changes: Partial<TFeature>): Promise<void>;
  delete(id: number): Promise<void>;
}
```

### Field Types

Supports 14 standard field types:

```typescript
type FieldType =
  | "boolean"   // Boolean
  | "byte"      // 8-bit integer
  | "int16"     // 16-bit integer
  | "int32"     // 32-bit integer
  | "int64"     // 64-bit integer
  | "single"    // Single precision float
  | "double"    // Double precision float
  | "date"      // Date
  | "time"      // Time
  | "binary"    // Binary data
  | "text"      // Text
  | "ntext"     // Long text
  | "char"      // Fixed-length char
  | "geometry"; // Geometry data
```

---

## Architecture

```
src/
├── core/                    # Core layer (platform-agnostic)
│   ├── dataset/             # Dataset implementations
│   ├── datasource/          # Data source entry
│   ├── geometry/            # Geometry codec
│   │   ├── gaia/            # GAIA binary codec
│   │   └── jsts/            # JSTS adapter
│   ├── schema/              # UDBX metadata tables
│   ├── sql/                 # SQL driver abstraction
│   └── types/               # Type definitions
├── shared-runtime/          # Shared runtime protocol
├── runtime-browser/         # Browser runtime
│   ├── client/              # Main thread client
│   ├── worker/              # Worker runtime
│   ├── sqlite/              # SQLite WASM adapter
│   └── fs/                  # OPFS file operations
└── runtime-electron/        # Electron runtime
    └── BetterSqlite3Driver.ts
```

**Key Design Principles:**

- **Core-Runtime Decoupling**: `src/core/` has no dependency on platform-specific APIs
- **Unified Async Interface**: All public APIs are async, hiding platform differences
- **Worker Isolation**: Browser database operations run entirely in Web Workers
- **Transaction Bulk Writes**: `insertMany` uses transactions and prepared statements for performance

---

## Examples

- [`examples/browser/`](./examples/browser/) — Browser complete example (Vite + Web Worker + OPFS)
- [`examples/electron/`](./examples/electron/) — Electron example (main process + IPC)

---

## Development

```bash
# Install dependencies
npm install

# Type check
npm run typecheck

# Run tests
npm test

# Browser tests
npm run test:browser

# Build
npm run build

# Start browser example
npm run dev:browser
```

---

## Related Projects

- [udbx4j](https://github.com/your-org/udbx4j) — Java implementation, comprehensive reference
- [udbx4spec](../udbx4spec/) — Cross-language API specification

---

## License

[MIT](./LICENSE)

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
npm install

# Type check
npm run typecheck

# Run unit and integration tests (vitest)
npm test
# Run a single test file
npx vitest run tests/unit/datasource-point.spec.ts
# Run tests matching a pattern
npx vitest run -t "inserts a point feature"

# Browser smoke tests (Playwright + Vite dev server)
npm run test:browser

# Build all entry points (ESM + CJS + types)
npm run build

# Start browser example dev server
npm run dev:browser
```

## Architecture

`udbx4ts` is a TypeScript UDBX spatial database runtime with a **core + runtime** architecture:

- **`src/core/`** — Platform-agnostic domain logic. Must not depend on DOM, Worker, Electron, or any specific SQLite driver.
  - `dataset/` — Dataset implementations (`PointDataset`, `LineDataset`, `RegionDataset`, `TabularDataset`, plus 3D variants and `CadDataset`). All extend `BaseDataset` and implement `Dataset` / `ReadableDataset` / `WritableDataset` interfaces.
  - `geometry/gaia/` — GAIA binary geometry codec (`GaiaPointCodec`, `GaiaLineCodec`, `GaiaPolygonCodec`, `GaiaGeometryCodec`). Handles 2D and 3D Point / MultiLineString / MultiPolygon.
  - `geometry/jsts/` — Optional JSTS (JavaScript Topology Suite) adapter (`toJsts`, `fromJsts`, `JstsGeometryCodec`).
  - `schema/` — UDBX metadata repositories (`SmRegisterRepository`, `SmFieldInfoRepository`) and schema initializer.
  - `sql/` — `SqlDriver` abstraction and SQL helpers. All DB access goes through this interface.
  - `types/` — Canonical type definitions: `DatasetKind`, `FieldType` (14 values), `Geometry`, `Feature`, `QueryOptions`, etc.

- **`src/shared-runtime/`** — RPC protocol and transport abstractions shared by both runtimes.
  - `rpc/protocol.ts` — Request/response envelope types.
  - `rpc/methods.ts` — RPC method name constants.

- **`src/runtime-browser/`** — Browser runtime using SQLite WASM in a Web Worker.
  - `worker/BrowserWorkerRuntime.ts` — Worker-side RPC dispatcher. Receives calls from the main thread and delegates to `core` datasets.
  - `client/BrowserDatasetClient.ts` — Main-thread proxy that implements `WritableDataset` by sending RPC messages.
  - `sqlite/` — SQLite WASM adapter and `BrowserSqliteDriver` (implements `SqlDriver`).
  - `fs/` — OPFS-based file I/O and workspace utilities.

- **`src/runtime-electron/`** — Electron runtime using `better-sqlite3`.
  - `BetterSqlite3Driver.ts` — Adapts the synchronous `better-sqlite3` API to the async `SqlDriver` interface.

## Build Outputs

Single npm package with multiple exports (configured in `tsup.config.ts`):

- `udbx4ts` → `src/index.ts` (core API + types)
- `udbx4ts/web` → `src/runtime-browser/index.ts`
- `udbx4ts/electron` → `src/runtime-electron/index.ts`

## Key Constraints

- **`src/core/`** cannot import from `src/runtime-browser/` or `src/runtime-electron/`.
- All database operations in the browser must happen inside the Worker (`BrowserWorkerRuntime`), never in the main thread.
- All public APIs are asynchronous.
- Bulk writes (`insertMany`) use transactions and prepared statements.
- `FieldType` has 14 canonical values: `boolean`, `byte`, `int16`, `int32`, `int64`, `single`, `double`, `date`, `binary`, `geometry`, `char`, `ntext`, `text`, `time`.
- `DatasetKind` values: `tabular`, `point`, `line`, `region`, `pointZ`, `lineZ`, `regionZ`, `cad`.

## Testing Structure

- `tests/unit/` — Vitest unit tests for core modules and browser utilities.
- `tests/integration/` — End-to-end integration tests using `NodeSqliteDriver`.
- `tests/browser/` — Playwright smoke tests for the browser example.
- `tests/support/NodeSqliteDriver.ts` — Node.js native SQLite driver used in unit/integration tests.

## CI

GitHub Actions runs `typecheck`, `npm test`, `npm run build`, and browser smoke tests on every PR.

## udbx4spec 规范合规

本项目严格遵循 `udbx4spec/` 中定义的跨语言规范。关键约束：

- **API 命名**：所有公开 API 必须与 `udbx4spec/docs/01-naming-conventions.md` 对齐
- **数据模型**：几何模型必须符合 `udbx4spec/docs/02-geometry-model.md`
- **数据集类型**：`DatasetKind` 枚举值必须与 `udbx4spec/docs/03-dataset-taxonomy.md` 同步
- **字段类型**：`FieldType` 枚举值必须与 `udbx4spec/docs/04-field-taxonomy.md` 同步（14 种）
- **变更流程**：任何 API 变更、新增数据集类型或字段类型，必须先在 udbx4spec 中定义，然后在各语言实现中同步

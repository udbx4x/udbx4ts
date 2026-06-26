# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [0.4.0] - 2026-06-26

### Added

- 新增公开 API 最小稳定面合规验证，覆盖 `getDataset`、`getById`、`list`、`count`、`insert`、`insertMany`、`update`、`delete` 的跨语言一致语义。
- 新增 `udbx4spec/compliance/compliance.udbx` 读取测试，覆盖 2D/3D 矢量、Tabular、Text / GeoText 和 CAD 最小 GeoHeader 数据集。
- 新增跨语言 roundtrip 夹具验证，覆盖 `udbx4j`、`udbx4ts`、`udbx4go` 三端生成的 UDBX。
- 新增 stable T3 source-derived fixture 验证，覆盖 `SampleData.udbx` 派生的 Text、CAD 和 3D 矢量样本。
- 新增真实样本专项测试，覆盖 `SampleData.udbx / County_T` Text 异常字节容错读取，以及 `BaseMap_PZ`、`BaseMap_LZ`、`BaseMap_RZ` 的 3D 几何读取。
- 新增浏览器运行时稳定 API 对齐验证，确保 `src/core/` 的语义不被浏览器 Worker / SQLite WASM 适配层改变。

### Changed

- `count()` 明确读取物理表真实行数，不以 `SmRegister.SmObjectCount` 缓存为准。
- `list()` 默认按 `SmID` 升序返回。
- `getDataset()`、`getById()`、`update()`、`delete()` 对不存在目标统一 reject `UdbxNotFoundError`。
- `update()` 对未知字段统一 reject not found 类错误，不再静默忽略。
- 合规报告补充 P0/P1 可执行测试入口、当前实现边界和真实样本专项验证状态。

### Notes

- Text / GeoText 与 CAD 当前声明为最小合规基线，不声明完整兼容所有真实世界复杂样式。
- stable T3 当前只覆盖已准入且可公开的 `SampleData.udbx` 派生夹具。
- Network、Network3D、Model 等数据集仍不在当前支持范围内。

## [0.3.0] - 2025-04-04

### Added
- 新增三维矢量数据集：`PointZDataset`、`LineZDataset`、`RegionZDataset`
- 新增 `TextDataset` / `CadDataset` 类型和创建入口
- `CadDataset` 补齐最小 GeoHeader 基线，支持 `CadPoint`、`CadLine`、`CadRegion` 的读写和 CRUD
- `udbx4spec` 合规测试新增 CAD 最小基线（`test_cad`），并纳入三实现 roundtrip 夹具
- `FieldType` 扩展至 14 种规范值（与 udbx4spec 同步）
- Point/Line/Region 及三维矢量数据集新增 `count()`、`update(id, changes)`、`delete(id)` 方法
- 新增 JSTS 适配器（`src/core/geometry/jsts/`）用于 GeoJSON-like 与 JSTS 几何对象的转换

### Changed
- API 命名对齐 udbx4spec 规范
- `DatasetKind` 支持三维类型（pointZ=101, lineZ=103, regionZ=105）、Text（text=7）和 CAD（cad=149）

### Known limitations
- `TextDataset` 已实现最小 GeoText CRUD 基线；后续仍需继续扩大真实 SuperMap 文本样式、异常编码和复杂文本对象兼容范围

## [0.1.0] - 2025-03-30

### Added

- Core UDBX spatial database read/write/query with GAIA geometry encoding
- Point dataset (GAIA type 1) with full CRUD and streaming
- Line dataset (GAIA type 5, MultiLineString) with full CRUD and streaming
- Region dataset (GAIA type 6, MultiPolygon) with full CRUD and streaming
- Tabular dataset (geometryless) with CRUD, update, delete, and streaming
- Browser runtime: sql.js WASM + OPFS + Web Worker RPC architecture
- Electron runtime: better-sqlite3 native driver with WAL journal mode
- Streaming reads via `AsyncIterable` (`iterate()`)
- Batch writes with prepared statement reuse (`insertMany()`)
- UDBX schema initialization (SmRegister, SmFieldInfo, geometry_columns)
- GAIA binary geometry codec (Point, MultiLineString, MultiPolygon)
- Browser example with Vite + Web Worker
- Electron example with IPC (main process + preload + renderer)
- 99 unit/integration tests

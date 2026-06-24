# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

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

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [0.1.0] - 2026-03-30

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

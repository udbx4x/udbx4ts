# udbx4spec 合规性检查报告

## 项目信息
- 项目：udbx4ts
- 类型：typescript
- 检查时间：2026-04-05T13:25:21.698854

## 检查概览

| 检查项 | 状态 | 通过数/总数 |
|--------|------|-------------|
| DatasetKind | ✅ | 9/9 |
| FieldType | ✅ | 14/14 |
| UdbxDataSource方法 | ✅ | 14/14 |
| 类型映射 | ✅ | 9/9 |

**总计：46/46 (接口存在性检查通过)**

注意：本报告只验证 DatasetKind、FieldType、DataSource 方法和类型映射是否存在。当前可执行合规覆盖已包含 2D/3D 矢量、Tabular、Text / GeoText 最小基线和 CAD 最小 GeoHeader（`GeoPoint`、`GeoLine`、`GeoRegion`）读写闭环。

## 可执行合规测试

当前已接入 `../udbx4spec/compliance/roundtrip-matrix.md` 的 P0/P1 测试入口：

```bash
npx vitest run tests/integration/udbx4spec-compliance.integration.spec.ts
```

| 矩阵项 | 状态 | 覆盖内容 |
|--------|------|----------|
| R1 Golden decode | ✅ | 解码 `udbx4spec/compliance/golden-gaia-bytes/` 中的全部 manifest fixture |
| R2 Golden encode | ✅ | 对解码后的 GAIA 几何重新编码，并与 Golden Bytes 做字节级一致性比较 |
| R3 Compliance read | ✅ | 打开 `udbx4spec/compliance/compliance.udbx`，校验 2D/3D 矢量、tabular、Text / GeoText 与 CAD 最小 GeoHeader 数据集的 kind、对象数、字段类型和代表性记录 |
| R4 单语言语义 roundtrip | ✅ | 读取覆盖 `point/line/region/pointZ/lineZ/regionZ/tabular/cad/text` 的 `compliance.udbx` 后通过 TypeScript SDK 写出临时 UDBX，再重新打开并比较数据集、字段、对象数、几何和属性语义 |
| R5 跨语言语义 roundtrip | ✅ 三实现闭环 | 由 `udbx4spec/tools/generate-roundtrip-fixtures.mjs` 使用 udbx4ts 生成 `udbx4ts-roundtrip.udbx`，供 `udbx4j`、`udbx4go` 读取验证；TypeScript 自身通过 roundtrip manifest 读取并验证 `udbx4go-roundtrip.udbx`、`udbx4j-roundtrip.udbx` |
| R6 Source-derived fixture | ✅ stable | 读取 `source-derived/sampledata/county-t/smid-1-smgeometry.bin`，验证真实 Text 中非 UTF-8 可读 `faceName` / `subText` 的容错解码行为；读取 `source-derived/sampledata/caddt/smid-1/16/63-smgeometry.bin`，验证真实 CAD Point / Line / Region 无样式 GeoHeader 解码行为；校验 `sampledata-3d-srid-zero-metadata` 的 stable manifest 与 3D metadata-json，并通过真实样本测试覆盖 `BaseMap_PZ` / `BaseMap_LZ` / `BaseMap_RZ` |

当前实现边界：

- Text / GeoText 与 CAD 已完成当前最小合规基线；后续继续扩大真实 SuperMap UDBX 样本兼容范围。
- T3 Source-derived fixture 当前为 `stable`，原始字节一致性、授权字段、生成工具字段和脱敏状态由 `udbx4spec/tools/check-fixtures.mjs` 校验；发布前必须运行 `npm run test:stable-t3`。
- 公开 API 最小稳定面已按 `udbx4spec/docs/08-api-stable-surface.md` 收敛：`getDataset` / `getById` 未命中 reject `UdbxNotFoundError`，`list` 默认按 `SmID` 升序，`count` 读取物理表真实行数，`update/delete` 对缺失对象 reject not found，`update` 对未知字段 reject not found，不再静默忽略。

## 详细检查结果

### DatasetKind

| 名称 | 期望值 | 实际值 | 状态 |
|------|--------|--------|------|
| DatasetKind "tabular" | "tabular" | 已找到 | ✅ |
| DatasetKind "point" | "point" | 已找到 | ✅ |
| DatasetKind "line" | "line" | 已找到 | ✅ |
| DatasetKind "region" | "region" | 已找到 | ✅ |
| DatasetKind "pointZ" | "pointZ" | 已找到 | ✅ |
| DatasetKind "lineZ" | "lineZ" | 已找到 | ✅ |
| DatasetKind "regionZ" | "regionZ" | 已找到 | ✅ |
| DatasetKind "text" | "text" | 已找到 | ✅ |
| DatasetKind "cad" | "cad" | 已找到 | ✅ |

### FieldType

| 名称 | 期望值 | 实际值 | 状态 |
|------|--------|--------|------|
| FieldType.boolean | "boolean" | 已找到 | ✅ |
| FieldType.byte | "byte" | 已找到 | ✅ |
| FieldType.int16 | "int16" | 已找到 | ✅ |
| FieldType.int32 | "int32" | 已找到 | ✅ |
| FieldType.int64 | "int64" | 已找到 | ✅ |
| FieldType.single | "single" | 已找到 | ✅ |
| FieldType.double | "double" | 已找到 | ✅ |
| FieldType.date | "date" | 已找到 | ✅ |
| FieldType.binary | "binary" | 已找到 | ✅ |
| FieldType.geometry | "geometry" | 已找到 | ✅ |
| FieldType.char | "char" | 已找到 | ✅ |
| FieldType.ntext | "ntext" | 已找到 | ✅ |
| FieldType.text | "text" | 已找到 | ✅ |
| FieldType.time | "time" | 已找到 | ✅ |

### UdbxDataSource方法

| 名称 | 期望值 | 实际值 | 状态 |
|------|--------|--------|------|
| open | open(...) | 已找到 | ✅ |
| create | create(...) | 已找到 | ✅ |
| getDataset | getDataset(...) | 已找到 | ✅ |
| listDatasets | listDatasets(...) | 已找到 | ✅ |
| close | close(...) | 已找到 | ✅ |
| createPointDataset | createPointDataset(...) | 已找到 | ✅ |
| createLineDataset | createLineDataset(...) | 已找到 | ✅ |
| createRegionDataset | createRegionDataset(...) | 已找到 | ✅ |
| createPointZDataset | createPointZDataset(...) | 已找到 | ✅ |
| createLineZDataset | createLineZDataset(...) | 已找到 | ✅ |
| createRegionZDataset | createRegionZDataset(...) | 已找到 | ✅ |
| createTabularDataset | createTabularDataset(...) | 已找到 | ✅ |
| createTextDataset | createTextDataset(...) | 已找到 | ✅ |
| createCadDataset | createCadDataset(...) | 已找到 | ✅ |

### 数据集实现缺口

| 数据集 | 状态 | 说明 |
|--------|------|------|
| TextDataset | ✅ | 已实现最小 GeoText `getById`、`list`、`iterate`、`count`、`insert`、`insertMany`、`update`、`delete` |
| CadDataset | ✅ | 已实现最小 GeoHeader `GeoPoint`、`GeoLine`、`GeoRegion` 的 `getById`、`list`、`iterate`、`count`、`insert`、`insertMany`、`update`、`delete` |

### 类型映射

| 名称 | 期望值 | 实际值 | 状态 |
|------|--------|--------|------|
| tabular -> 0 | tabular: 0 | 已找到 | ✅ |
| point -> 1 | point: 1 | 已找到 | ✅ |
| line -> 3 | line: 3 | 已找到 | ✅ |
| region -> 5 | region: 5 | 已找到 | ✅ |
| pointZ -> 101 | pointZ: 101 | 已找到 | ✅ |
| lineZ -> 103 | lineZ: 103 | 已找到 | ✅ |
| regionZ -> 105 | regionZ: 105 | 已找到 | ✅ |
| text -> 7 | text: 7 | 已找到 | ✅ |
| cad -> 149 | cad: 149 | 已找到 | ✅ |

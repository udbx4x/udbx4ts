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

**总计：46/46 (100%)**

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

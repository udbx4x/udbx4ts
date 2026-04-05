import type { DatasetKind, FieldType } from "../types";

const datasetKindToValueMap: Record<DatasetKind, number> = {
  tabular: 0,
  point: 1,
  line: 3,
  region: 5,
  pointZ: 101,
  lineZ: 103,
  regionZ: 105,
  text: 7,
  cad: 149
};

const datasetValueToKindMap = new Map<number, DatasetKind>(
  Object.entries(datasetKindToValueMap).map(([kind, value]) => [
    value,
    kind as DatasetKind
  ])
);

const fieldTypeToValueMap: Record<FieldType, number> = {
  boolean: 1,
  byte: 2,
  int16: 3,
  int32: 4,
  int64: 5,
  single: 6,
  double: 7,
  date: 8,
  binary: 9,
  geometry: 10,
  char: 11,
  ntext: 127,
  text: 128,
  time: 16
};

const fieldValueToTypeMap = new Map<number, FieldType>([
  [1, "boolean"],
  [2, "byte"],
  [3, "int16"],
  [4, "int32"],
  [5, "int64"],
  [6, "single"],
  [7, "double"],
  [8, "date"],
  [9, "binary"],
  [10, "geometry"],
  [11, "char"],
  [16, "time"],
  [127, "ntext"],
  [128, "text"]
]);

export function datasetKindToValue(kind: DatasetKind): number {
  return datasetKindToValueMap[kind];
}

export function datasetValueToKind(value: number): DatasetKind {
  const kind = datasetValueToKindMap.get(value);
  if (!kind) {
    throw new Error(`Unsupported SmDatasetType value: ${value}.`);
  }

  return kind;
}

export function fieldTypeToValue(type: FieldType): number {
  return fieldTypeToValueMap[type];
}

export function fieldValueToType(value: number): FieldType {
  const type = fieldValueToTypeMap.get(value);
  if (!type) {
    throw new Error(`Unsupported SmFieldType value: ${value}.`);
  }

  return type;
}


import { GeometryColumnsRepository } from "../schema/GeometryColumnsRepository";
import type { GeometryColumnsRecord } from "../schema/GeometryColumnsRepository";
import type { SmRegisterSpatialMetadata } from "../schema/SmRegisterRepository";
import { queryAll, queryOne } from "../sql/SqlHelpers";
import type { SqlDriver } from "../sql/SqlDriver";
import type {
  DatasetInfo,
  DatasetKind,
  SpatialQueryReason
} from "../types";

export interface DetectedSpatialCapability {
  readonly idColumn: string;
  readonly envelopeColumn: string;
  readonly payloadColumn: string;
  readonly cadTypeColumn: string | null;
  readonly rtreeName: string | null;
}

export interface SpatialQueryCapability {
  readonly supported: boolean;
  readonly rtreeAvailable: boolean;
  readonly fallbackAvailable: boolean;
  readonly diagnosticReason: SpatialQueryReason | null;
}

export interface SpatialCapabilityResult {
  readonly capability: SpatialQueryCapability;
  readonly detected: DetectedSpatialCapability | null;
}

interface ColumnInfo {
  readonly name: string;
  readonly typeName: string;
}

const SUPPORTED_KINDS = new Set<DatasetKind>([
  "point",
  "line",
  "region",
  "text",
  "pointZ",
  "lineZ",
  "regionZ",
  "cad"
]);

const RTREE_DEFINITION_PATTERN =
  /^\s*CREATE\s+VIRTUAL\s+TABLE\b[\s\S]*\bUSING\s+rtree\s*\(/i;

/** 与 Go `supportsSpatialQuery` 保持一致的数据集类型覆盖集合。 */
export function supportsSpatialQuery(kind: DatasetKind): boolean {
  return SUPPORTED_KINDS.has(kind);
}

export function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

async function tableInfo(
  driver: SqlDriver,
  tableName: string
): Promise<readonly ColumnInfo[]> {
  const rows = await queryAll<{ name: string; type: string }>(
    driver,
    `PRAGMA table_info(${quoteIdentifier(tableName)})`
  );
  return rows.map((row) => ({ name: row.name, typeName: row.type }));
}

function physicalColumnName(
  columns: readonly ColumnInfo[],
  name: string
): string | null {
  for (const column of columns) {
    if (column.name.toLowerCase() === name.toLowerCase()) {
      return column.name;
    }
  }
  return null;
}

function spatialColumnRoles(
  kind: DatasetKind,
  register: SmRegisterSpatialMetadata,
  geometryRecord: GeometryColumnsRecord
): { envelopeColumn: string; payloadColumn: string } | null {
  if (kind === "text" || kind === "cad") {
    if (geometryRecord.fGeometryColumn.toLowerCase() !== "smindexkey") {
      return null;
    }
    if (geometryRecord.geometryType !== 3) {
      return null;
    }
    if (!validTextCADEnvelopeDimension(kind, geometryRecord.coordDimension)) {
      return null;
    }
    const registered = register.geometryColumnName ?? "";
    if (registered !== "" && registered.toLowerCase() !== "smgeometry") {
      return null;
    }
    return { envelopeColumn: geometryRecord.fGeometryColumn, payloadColumn: "SmGeometry" };
  }

  if (geometryRecord.fGeometryColumn === "") {
    return null;
  }
  const registered = register.geometryColumnName ?? "";
  if (
    registered !== "" &&
    registered.toLowerCase() !== geometryRecord.fGeometryColumn.toLowerCase()
  ) {
    return null;
  }
  return {
    envelopeColumn: geometryRecord.fGeometryColumn,
    payloadColumn: geometryRecord.fGeometryColumn
  };
}

function validTextCADEnvelopeDimension(
  kind: DatasetKind,
  dimension: number
): boolean {
  if (kind === "cad") {
    return dimension === 2 || dimension === 3;
  }
  return dimension === 2;
}

function isSQLiteRealType(typeName: string): boolean {
  const upper = typeName.toUpperCase();
  return (
    upper.includes("REAL") || upper.includes("FLOA") || upper.includes("DOUB")
  );
}

function validRTreeColumns(columns: readonly ColumnInfo[]): boolean {
  const required: Readonly<Record<string, (typeName: string) => boolean>> = {
    pkid: (typeName) => typeName.toUpperCase().includes("INT"),
    xmin: isSQLiteRealType,
    xmax: isSQLiteRealType,
    ymin: isSQLiteRealType,
    ymax: isSQLiteRealType
  };
  const found = new Set<string>();
  for (const column of columns) {
    const key = column.name.toLowerCase();
    const validate = required[key];
    if (validate && validate(column.typeName)) {
      found.add(key);
    }
  }
  return Object.keys(required).every((key) => found.has(key));
}

/**
 * 探测数据集的视口空间查询能力，语义与 Go
 * `internal/dataset/spatial_capability.go` 对齐。
 */
export async function detectSpatialCapability(
  driver: SqlDriver,
  info: DatasetInfo,
  register: SmRegisterSpatialMetadata
): Promise<SpatialCapabilityResult> {
  if (!supportsSpatialQuery(info.kind)) {
    return {
      capability: {
        supported: false,
        rtreeAvailable: false,
        fallbackAvailable: false,
        diagnosticReason: "unsupported_dataset_kind"
      },
      detected: null
    };
  }

  const unavailable = (
    fallbackAvailable: boolean,
    detected: DetectedSpatialCapability | null
  ): SpatialCapabilityResult => ({
    capability: {
      supported: true,
      rtreeAvailable: false,
      fallbackAvailable,
      diagnosticReason: "spatial_index_unavailable"
    },
    detected
  });

  const records = await new GeometryColumnsRepository(driver).listByTableName(
    info.tableName
  );
  const [geometryRecord] = records;
  if (
    records.length !== 1 ||
    !geometryRecord ||
    geometryRecord.fTableName.toLowerCase() !== info.tableName.toLowerCase()
  ) {
    return unavailable(false, null);
  }

  const roles = spatialColumnRoles(info.kind, register, geometryRecord);
  if (!roles) {
    return unavailable(false, null);
  }

  const columns = await tableInfo(driver, info.tableName);
  const idColumn = physicalColumnName(
    columns,
    register.idColumnName || "SmID"
  );
  const envelopeColumn = physicalColumnName(columns, roles.envelopeColumn);
  const payloadColumn = physicalColumnName(columns, roles.payloadColumn);
  if (!idColumn || !envelopeColumn || !payloadColumn) {
    return unavailable(false, null);
  }

  let cadTypeColumn: string | null = null;
  if (info.kind === "cad") {
    cadTypeColumn = physicalColumnName(columns, "SmGeoType");
    if (!cadTypeColumn) {
      return unavailable(false, null);
    }
  }

  const detected: DetectedSpatialCapability = {
    idColumn,
    envelopeColumn,
    payloadColumn,
    cadTypeColumn,
    rtreeName: null
  };

  if (geometryRecord.spatialIndexEnabled !== 1) {
    return unavailable(true, detected);
  }

  const rtreeName = `idx_${info.tableName}_${envelopeColumn}`;
  const definition = await queryOne<{ sql: string | null }>(
    driver,
    `SELECT sql FROM sqlite_master
     WHERE type = 'table' AND name = ? COLLATE NOCASE`,
    [rtreeName]
  );
  if (
    !definition ||
    definition.sql === null ||
    !RTREE_DEFINITION_PATTERN.test(definition.sql)
  ) {
    return unavailable(true, detected);
  }

  const rtreeColumns = await tableInfo(driver, rtreeName);
  if (!validRTreeColumns(rtreeColumns)) {
    return unavailable(true, detected);
  }

  return {
    capability: {
      supported: true,
      rtreeAvailable: true,
      fallbackAvailable: true,
      diagnosticReason: null
    },
    detected: { ...detected, rtreeName }
  };
}

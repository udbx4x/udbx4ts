import type { SqlValue } from "../sql/SqlDriver";
import type { FieldInfo, QueryOptions } from "../types";

export function normalizeGeometryBlob(
  value: Uint8Array | ArrayBuffer
): Uint8Array {
  return value instanceof Uint8Array ? value : new Uint8Array(value);
}

export function buildListSql(
  tableName: string,
  options?: QueryOptions
): { sql: string; params: SqlValue[] } {
  const params: SqlValue[] = [];
  const clauses: string[] = [];

  if (options?.ids?.length) {
    const placeholders = options.ids.map(() => "?").join(", ");
    clauses.push(`SmID IN (${placeholders})`);
    params.push(...options.ids);
  }

  const whereClause = clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";
  let sql = `SELECT * FROM "${tableName}"${whereClause} ORDER BY SmID`;

  if (options?.limit !== undefined) {
    sql += " LIMIT ?";
    params.push(options.limit);
  }

  if (options?.offset !== undefined) {
    if (options.limit === undefined) {
      sql += " LIMIT -1";
    }
    sql += " OFFSET ?";
    params.push(options.offset);
  }

  return { sql, params };
}

export function sqliteColumnType(field: FieldInfo): string {
  switch (field.fieldType) {
    case "boolean":
    case "byte":
    case "int16":
    case "int32":
    case "int64":
      return "INTEGER";
    case "single":
    case "double":
      return "REAL";
    case "binary":
    case "geometry":
      return "BLOB";
    case "date":
    case "char":
    case "ntext":
    case "text":
    case "time":
    default:
      return "TEXT";
  }
}


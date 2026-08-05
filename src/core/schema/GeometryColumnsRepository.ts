import { queryAll } from "../sql/SqlHelpers";
import type { SqlDriver } from "../sql/SqlDriver";

export interface GeometryColumnsRecord {
  readonly fTableName: string;
  readonly fGeometryColumn: string;
  readonly geometryType: number;
  readonly coordDimension: number;
  readonly srid: number;
  readonly spatialIndexEnabled: number;
}

/** geometry_columns 系统表访问（OGC/SpatiaLite 标准空间元数据）。 */
export class GeometryColumnsRepository {
  constructor(private readonly driver: SqlDriver) {}

  async listByTableName(
    tableName: string
  ): Promise<readonly GeometryColumnsRecord[]> {
    return queryAll<GeometryColumnsRecord>(
      this.driver,
      `SELECT
         f_table_name AS fTableName,
         f_geometry_column AS fGeometryColumn,
         geometry_type AS geometryType,
         coord_dimension AS coordDimension,
         srid,
         spatial_index_enabled AS spatialIndexEnabled
       FROM geometry_columns
       WHERE f_table_name = ? COLLATE NOCASE
       ORDER BY f_geometry_column`,
      [tableName]
    );
  }
}

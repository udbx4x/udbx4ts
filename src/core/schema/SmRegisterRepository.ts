import { executeStatement, queryAll, queryOne } from "../sql/SqlHelpers";
import type { SqlDriver } from "../sql/SqlDriver";
import type { DatasetInfo, DatasetKind } from "../types";
import { datasetKindToValue, datasetValueToKind } from "./UdbxTypeMappings";

interface SmRegisterRow {
  readonly SmDatasetID: number;
  readonly SmDatasetName: string;
  readonly SmTableName: string;
  readonly SmDatasetType: number;
  readonly SmObjectCount: number;
  readonly SmSRID: number | null;
  readonly geometryType?: number | null;
}

function mapRow(row: SmRegisterRow): DatasetInfo {
  return {
    id: row.SmDatasetID,
    name: row.SmDatasetName,
    kind: datasetValueToKind(row.SmDatasetType),
    tableName: row.SmTableName,
    srid: row.SmSRID ?? null,
    objectCount: row.SmObjectCount,
    geometryType: row.geometryType ?? null
  };
}

export class SmRegisterRepository {
  constructor(private readonly driver: SqlDriver) {}

  async findAll(): Promise<readonly DatasetInfo[]> {
    const rows = await queryAll<SmRegisterRow>(
      this.driver,
      `SELECT
         SmDatasetID,
         SmDatasetName,
         SmTableName,
         SmDatasetType,
         SmObjectCount,
         SmSRID
       FROM SmRegister
       ORDER BY SmDatasetID`
    );

    return rows.map(mapRow);
  }

  async findByName(name: string): Promise<DatasetInfo | null> {
    const row = await queryOne<SmRegisterRow>(
      this.driver,
      `SELECT
         SmDatasetID,
         SmDatasetName,
         SmTableName,
         SmDatasetType,
         SmObjectCount,
         SmSRID
       FROM SmRegister
       WHERE SmDatasetName = ?`,
      [name]
    );

    return row ? mapRow(row) : null;
  }

  async nextDatasetId(): Promise<number> {
    const row = await queryOne<{ nextId: number }>(
      this.driver,
      "SELECT COALESCE(MAX(SmDatasetID), 0) + 1 AS nextId FROM SmRegister"
    );

    return row?.nextId ?? 1;
  }

  async insert(params: {
    readonly name: string;
    readonly kind: DatasetKind;
    readonly srid: number;
    readonly idColumnName: string;
    readonly geometryColumnName: string | null;
  }): Promise<number> {
    const datasetId = await this.nextDatasetId();
    const statement = await this.driver.prepare(
      `INSERT INTO SmRegister (
         SmDatasetID,
         SmDatasetName,
         SmTableName,
         SmDatasetType,
         SmObjectCount,
         SmSRID,
         SmIDColName,
         SmGeoColName,
         SmMaxGeometrySize,
         SmCreateTime,
         SmLastUpdateTime
       ) VALUES (?, ?, ?, ?, 0, ?, ?, ?, 0, datetime('now'), datetime('now'))`
    );

    await executeStatement(statement, [
      datasetId,
      params.name,
      params.name,
      datasetKindToValue(params.kind),
      params.srid,
      params.idColumnName,
      params.geometryColumnName
    ]);

    return datasetId;
  }

  async incrementObjectCount(
    datasetId: number,
    geometrySize?: number
  ): Promise<void> {
    if (geometrySize === undefined) {
      const statement = await this.driver.prepare(
        "UPDATE SmRegister SET SmObjectCount = SmObjectCount + 1 WHERE SmDatasetID = ?"
      );
      await executeStatement(statement, [datasetId]);
      return;
    }

    const statement = await this.driver.prepare(
      `UPDATE SmRegister
       SET SmObjectCount = SmObjectCount + 1,
           SmMaxGeometrySize = CASE
             WHEN SmMaxGeometrySize < ? THEN ?
             ELSE SmMaxGeometrySize
           END
       WHERE SmDatasetID = ?`
    );
    await executeStatement(statement, [geometrySize, geometrySize, datasetId]);
  }

  async incrementObjectCountBatch(
    datasetId: number,
    count: number,
    maxGeometrySize: number
  ): Promise<void> {
    const statement = await this.driver.prepare(
      `UPDATE SmRegister
       SET SmObjectCount = SmObjectCount + ?,
           SmMaxGeometrySize = CASE
             WHEN SmMaxGeometrySize < ? THEN ?
             ELSE SmMaxGeometrySize
           END
       WHERE SmDatasetID = ?`
    );
    await executeStatement(statement, [
      count,
      maxGeometrySize,
      maxGeometrySize,
      datasetId
    ]);
  }

  async decrementObjectCount(datasetId: number): Promise<void> {
    const statement = await this.driver.prepare(
      "UPDATE SmRegister SET SmObjectCount = SmObjectCount - 1 WHERE SmDatasetID = ? AND SmObjectCount > 0"
    );
    await executeStatement(statement, [datasetId]);
  }
}

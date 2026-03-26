import { executeStatement, queryAll } from "../sql/SqlHelpers";
import type { SqlDriver } from "../sql/SqlDriver";
import type { FieldInfo } from "../types";
import { fieldTypeToValue, fieldValueToType } from "./UdbxTypeMappings";

interface SmFieldInfoRow {
  readonly SmFieldName: string;
  readonly SmFieldType: number;
  readonly SmFieldbRequired: number | null;
  readonly SmFieldDefaultValue: string | null;
}

function mapRow(row: SmFieldInfoRow): FieldInfo {
  return {
    name: row.SmFieldName,
    fieldType: fieldValueToType(row.SmFieldType),
    nullable: row.SmFieldbRequired !== 1,
    defaultValue: row.SmFieldDefaultValue ?? undefined
  };
}

export class SmFieldInfoRepository {
  constructor(private readonly driver: SqlDriver) {}

  async findByDatasetId(datasetId: number): Promise<readonly FieldInfo[]> {
    const rows = await queryAll<SmFieldInfoRow>(
      this.driver,
      `SELECT
         SmFieldName,
         SmFieldType,
         SmFieldbRequired,
         SmFieldDefaultValue
       FROM SmFieldInfo
       WHERE SmDatasetID = ?
       ORDER BY SmID`,
      [datasetId]
    );

    return rows.map(mapRow);
  }

  async insertAll(datasetId: number, fields: readonly FieldInfo[]): Promise<void> {
    for (const field of fields) {
      const statement = await this.driver.prepare(
        `INSERT INTO SmFieldInfo (
           SmDatasetID,
           SmFieldName,
           SmFieldType,
           SmFieldCaption,
           SmFieldbRequired,
           SmFieldDefaultValue
         ) VALUES (?, ?, ?, ?, ?, ?)`
      );

      await executeStatement(statement, [
        datasetId,
        field.name,
        fieldTypeToValue(field.fieldType),
        field.name,
        field.nullable ? 0 : 1,
        field.defaultValue == null ? null : String(field.defaultValue)
      ]);
    }
  }
}

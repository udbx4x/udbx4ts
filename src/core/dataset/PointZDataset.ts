import { GaiaPointCodec } from "../geometry/gaia/GaiaPointCodec";
import { SmFieldInfoRepository } from "../schema/SmFieldInfoRepository";
import { SmRegisterRepository } from "../schema/SmRegisterRepository";
import { executeSql, queryAll, queryOne } from "../sql/SqlHelpers";
import type { SqlDriver, SqlValue } from "../sql/SqlDriver";
import type {
  DatasetInfo,
  Feature,
  FieldInfo,
  PointGeometry,
  QueryOptions
} from "../types";
import { BaseDataset } from "./BaseDataset";
import type { WritableDataset } from "./Dataset";
import {
  buildListSql,
  normalizeGeometryBlob,
  sqliteColumnType
} from "./vectorDatasetShared";

export type PointZFeature<
  TAttributes extends Record<string, unknown> = Record<string, unknown>
> = Feature<PointGeometry, TAttributes>;

interface PointZDatasetRow extends Record<string, unknown> {
  readonly SmID: number;
  readonly SmGeometry: Uint8Array | ArrayBuffer;
}

function mapPointZRow<TAttributes extends Record<string, unknown>>(
  row: PointZDatasetRow
): PointZFeature<TAttributes> {
  const { SmID, SmGeometry, ...attributes } = row;

  return {
    id: SmID,
    geometry: GaiaPointCodec.readPointZ(normalizeGeometryBlob(SmGeometry)),
    attributes: attributes as TAttributes
  };
}

export class PointZDataset<
    TAttributes extends Record<string, unknown> = Record<string, unknown>
  >
  extends BaseDataset
  implements WritableDataset<PointZFeature<TAttributes>>
{
  private readonly registerRepository: SmRegisterRepository;

  constructor(driver: SqlDriver, info: DatasetInfo) {
    super(driver, info);
    this.registerRepository = new SmRegisterRepository(driver);
  }

  async getById(id: number): Promise<PointZFeature<TAttributes> | null> {
    const row = await queryOne<PointZDatasetRow>(
      this.driver,
      `SELECT * FROM "${this.info.tableName}" WHERE SmID = ?`,
      [id]
    );

    return row ? mapPointZRow<TAttributes>(row) : null;
  }

  async list(options?: QueryOptions): Promise<readonly PointZFeature<TAttributes>[]> {
    const { sql, params } = buildListSql(this.info.tableName, options);
    const rows = await queryAll<PointZDatasetRow>(this.driver, sql, params);
    return rows.map((row) => mapPointZRow<TAttributes>(row));
  }

  async *iterate(
    options?: QueryOptions
  ): AsyncIterable<PointZFeature<TAttributes>> {
    const { sql, params } = buildListSql(this.info.tableName, options);
    const statement = await this.driver.prepare(sql);

    try {
      if (params.length > 0) {
        await statement.bind(params);
      }

      while (await statement.step()) {
        yield mapPointZRow<TAttributes>(await statement.getRow<PointZDatasetRow>());
      }
    } finally {
      await statement.finalize();
    }
  }

  async count(): Promise<number> {
    const row = await queryOne<{ readonly count: number }>(
      this.driver,
      `SELECT COUNT(*) AS count FROM "${this.info.tableName}"`,
      []
    );
    return row?.count ?? 0;
  }

  async insert(feature: PointZFeature<TAttributes>): Promise<void> {
    const userFields = await this.getFields();
    const columnNames = ["SmID", "SmUserID", "SmGeometry", ...userFields.map((field) => field.name)];
    const placeholders = columnNames.map(() => "?").join(", ");
    const geometry = GaiaPointCodec.writePointZ(
      feature.geometry,
      feature.geometry.srid ?? this.info.srid ?? 0
    );
    const sql = `INSERT INTO "${this.info.tableName}" (${columnNames.map((column) => `"${column}"`).join(", ")}) VALUES (${placeholders})`;
    const params: SqlValue[] = [
      feature.id,
      0,
      geometry,
      ...userFields.map((field) => (feature.attributes[field.name] as SqlValue | undefined) ?? null)
    ];

    await this.driver.transaction(async () => {
      await executeSql(this.driver, sql, params);
      await this.registerRepository.incrementObjectCount(this.info.id, geometry.byteLength);
    });
  }

  async insertMany(
    features: Iterable<PointZFeature<TAttributes>> | AsyncIterable<PointZFeature<TAttributes>>
  ): Promise<void> {
    const userFields = await this.getFields();
    const columnNames = ["SmID", "SmUserID", "SmGeometry", ...userFields.map((field) => field.name)];
    const placeholders = columnNames.map(() => "?").join(", ");
    const sql = `INSERT INTO "${this.info.tableName}" (${columnNames.map((column) => `"${column}"`).join(", ")}) VALUES (${placeholders})`;

    await this.driver.transaction(async () => {
      const statement = await this.driver.prepare(sql);
      try {
        let count = 0;
        let maxGeometrySize = 0;

        for await (const feature of features) {
          const geometry = GaiaPointCodec.writePointZ(
            feature.geometry,
            feature.geometry.srid ?? this.info.srid ?? 0
          );
          maxGeometrySize = Math.max(maxGeometrySize, geometry.byteLength);
          const params: SqlValue[] = [
            feature.id,
            0,
            geometry,
            ...userFields.map(
              (field) => (feature.attributes[field.name] as SqlValue | undefined) ?? null
            )
          ];

          await statement.bind(params);
          await statement.step();
          await statement.reset();
          count++;
        }

        if (count > 0) {
          await this.registerRepository.incrementObjectCountBatch(
            this.info.id,
            count,
            maxGeometrySize
          );
        }
      } finally {
        await statement.finalize();
      }
    });
  }

  async update(
    id: number,
    changes: {
      geometry?: PointGeometry;
      attributes?: Partial<TAttributes>;
    }
  ): Promise<void> {
    if (!changes.geometry && !changes.attributes) {
      return;
    }

    const setClauses: string[] = [];
    const params: SqlValue[] = [];

    if (changes.geometry) {
      const geometry = GaiaPointCodec.writePointZ(
        changes.geometry,
        changes.geometry.srid ?? this.info.srid ?? 0
      );
      setClauses.push('"SmGeometry" = ?');
      params.push(geometry);
    }

    if (changes.attributes) {
      const userFields = await this.getFields();
      const fieldNames = new Set(userFields.map((f) => f.name));
      const validEntries = Object.entries(changes.attributes).filter(([key]) =>
        fieldNames.has(key)
      );
      for (const [key, value] of validEntries) {
        setClauses.push(`"${key}" = ?`);
        params.push(value as SqlValue);
      }
    }

    if (setClauses.length === 0) {
      return;
    }

    const sql = `UPDATE "${this.info.tableName}" SET ${setClauses.join(", ")} WHERE SmID = ?`;
    params.push(id);

    await this.driver.transaction(async () => {
      await executeSql(this.driver, sql, params);
    });
  }

  async delete(id: number): Promise<void> {
    await this.driver.transaction(async () => {
      await executeSql(
        this.driver,
        `DELETE FROM "${this.info.tableName}" WHERE SmID = ?`,
        [id]
      );
      await this.registerRepository.decrementObjectCount(this.info.id);
    });
  }

  static async create(
    driver: SqlDriver,
    registerRepository: SmRegisterRepository,
    params: {
      readonly name: string;
      readonly srid: number;
      readonly fields?: readonly FieldInfo[];
    }
  ): Promise<PointZDataset> {
    const fields = params.fields ?? [];
    const datasetId = await registerRepository.insert({
      name: params.name,
      kind: "pointZ",
      srid: params.srid,
      idColumnName: "SmID",
      geometryColumnName: "SmGeometry"
    });

    const userColumnDefinitions = fields.map((field) => {
      const nullability = field.nullable ? "" : " NOT NULL";
      return `"${field.name}" ${sqliteColumnType(field)}${nullability}`;
    });

    const createTableParts = [
      `"SmID" INTEGER NOT NULL PRIMARY KEY`,
      `"SmUserID" INTEGER DEFAULT 0 NOT NULL`,
      `"SmGeometry" BLOB NOT NULL`,
      ...userColumnDefinitions
    ];

    await driver.exec(
      `CREATE TABLE "${params.name}" (${createTableParts.join(", ")})`
    );
    await executeSql(
      driver,
      `INSERT INTO geometry_columns (
         f_table_name,
         f_geometry_column,
         geometry_type,
         coord_dimension,
         srid,
         spatial_index_enabled
       ) VALUES (?, ?, ?, ?, ?, ?)`,
      [params.name, "SmGeometry", 1001, 3, params.srid, 0]
    );

    if (fields.length > 0) {
      const fieldInfoRepository = new SmFieldInfoRepository(driver);
      await fieldInfoRepository.insertAll(datasetId, fields);
    }

    return new PointZDataset(driver, {
      id: datasetId,
      name: params.name,
      kind: "pointZ",
      tableName: params.name,
      srid: params.srid,
      objectCount: 0,
      geometryType: 1001
    });
  }
}

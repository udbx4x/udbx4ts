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

export type PointFeature<
  TAttributes extends Record<string, unknown> = Record<string, unknown>
> = Feature<PointGeometry, TAttributes>;

interface PointDatasetRow extends Record<string, unknown> {
  readonly SmID: number;
  readonly SmGeometry: Uint8Array | ArrayBuffer;
}

function mapPointRow<TAttributes extends Record<string, unknown>>(
  row: PointDatasetRow
): PointFeature<TAttributes> {
  const { SmID, SmGeometry, ...attributes } = row;

  return {
    id: SmID,
    geometry: GaiaPointCodec.readPoint(normalizeGeometryBlob(SmGeometry)),
    attributes: attributes as TAttributes
  };
}

export class PointDataset<
    TAttributes extends Record<string, unknown> = Record<string, unknown>
  >
  extends BaseDataset
  implements WritableDataset<PointFeature<TAttributes>>
{
  private readonly registerRepository: SmRegisterRepository;

  constructor(driver: SqlDriver, info: DatasetInfo) {
    super(driver, info);
    this.registerRepository = new SmRegisterRepository(driver);
  }

  async getById(id: number): Promise<PointFeature<TAttributes> | null> {
    const row = await queryOne<PointDatasetRow>(
      this.driver,
      `SELECT * FROM "${this.info.tableName}" WHERE SmID = ?`,
      [id]
    );

    return row ? mapPointRow<TAttributes>(row) : null;
  }

  async list(options?: QueryOptions): Promise<readonly PointFeature<TAttributes>[]> {
    const { sql, params } = buildListSql(this.info.tableName, options);
    const rows = await queryAll<PointDatasetRow>(this.driver, sql, params);
    return rows.map((row) => mapPointRow<TAttributes>(row));
  }

  async *iterate(
    options?: QueryOptions
  ): AsyncIterable<PointFeature<TAttributes>> {
    const { sql, params } = buildListSql(this.info.tableName, options);
    const statement = await this.driver.prepare(sql);

    try {
      if (params.length > 0) {
        await statement.bind(params);
      }

      while (await statement.step()) {
        yield mapPointRow<TAttributes>(await statement.getRow<PointDatasetRow>());
      }
    } finally {
      await statement.finalize();
    }
  }

  async insert(feature: PointFeature<TAttributes>): Promise<void> {
    const userFields = await this.getFields();
    const columnNames = ["SmID", "SmUserID", "SmGeometry", ...userFields.map((field) => field.name)];
    const placeholders = columnNames.map(() => "?").join(", ");
    const geometry = GaiaPointCodec.writePoint(feature.geometry, feature.geometry.srid ?? this.info.srid ?? 0);
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
    features: Iterable<PointFeature<TAttributes>> | AsyncIterable<PointFeature<TAttributes>>
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
          const geometry = GaiaPointCodec.writePoint(
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

  static async create(
    driver: SqlDriver,
    registerRepository: SmRegisterRepository,
    params: {
      readonly name: string;
      readonly srid: number;
      readonly fields?: readonly FieldInfo[];
    }
  ): Promise<PointDataset> {
    const fields = params.fields ?? [];
    const datasetId = await registerRepository.insert({
      name: params.name,
      kind: "point",
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
      [params.name, "SmGeometry", 1, 2, params.srid, 0]
    );

    if (fields.length > 0) {
      const fieldInfoRepository = new SmFieldInfoRepository(driver);
      await fieldInfoRepository.insertAll(datasetId, fields);
    }

    return new PointDataset(driver, {
      id: datasetId,
      name: params.name,
      kind: "point",
      tableName: params.name,
      srid: params.srid,
      objectCount: 0,
      geometryType: 1
    });
  }
}

import { CadGeometryCodec } from "../geometry/cad/CadGeometryCodec";
import { SmFieldInfoRepository } from "../schema/SmFieldInfoRepository";
import { SmRegisterRepository } from "../schema/SmRegisterRepository";
import { executeSql, queryAll, queryOne } from "../sql/SqlHelpers";
import type { SqlDriver, SqlValue } from "../sql/SqlDriver";
import type {
  CadGeometry,
  DatasetInfo,
  Feature,
  FieldInfo,
  QueryOptions
} from "../types";
import { BaseDataset } from "./BaseDataset";
import type { WritableDataset } from "./Dataset";
import {
  buildListSql,
  normalizeGeometryBlob,
  sqliteColumnType
} from "./vectorDatasetShared";

export type CadFeature<
  TAttributes extends Record<string, unknown> = Record<string, unknown>
> = Feature<CadGeometry, TAttributes>;

interface CadDatasetRow extends Record<string, unknown> {
  readonly SmID: number;
  readonly SmGeometry: Uint8Array | ArrayBuffer;
}

function mapCadRow<TAttributes extends Record<string, unknown>>(
  row: CadDatasetRow
): CadFeature<TAttributes> {
  const { SmID, SmGeometry, SmUserID: _SmUserID, ...attributes } = row;

  return {
    id: SmID,
    geometry: CadGeometryCodec.read(normalizeGeometryBlob(SmGeometry)),
    attributes: attributes as TAttributes
  };
}

export class CadDataset<
    TAttributes extends Record<string, unknown> = Record<string, unknown>
  >
  extends BaseDataset
  implements WritableDataset<CadFeature<TAttributes>>
{
  private readonly registerRepository: SmRegisterRepository;

  constructor(driver: SqlDriver, info: DatasetInfo) {
    super(driver, info);
    this.registerRepository = new SmRegisterRepository(driver);
  }

  async getById(id: number): Promise<CadFeature<TAttributes>> {
    const row = await queryOne<CadDatasetRow>(
      this.driver,
      `SELECT * FROM "${this.info.tableName}" WHERE SmID = ?`,
      [id]
    );

    if (!row) {
      throw this.objectNotFound(id);
    }
    return mapCadRow<TAttributes>(row);
  }

  async list(options?: QueryOptions): Promise<readonly CadFeature<TAttributes>[]> {
    const { sql, params } = buildListSql(this.info.tableName, options);
    const rows = await queryAll<CadDatasetRow>(this.driver, sql, params);
    return rows.map((row) => mapCadRow<TAttributes>(row));
  }

  async *iterate(
    options?: QueryOptions
  ): AsyncIterable<CadFeature<TAttributes>> {
    const { sql, params } = buildListSql(this.info.tableName, options);
    const statement = await this.driver.prepare(sql);

    try {
      if (params.length > 0) {
        await statement.bind(params);
      }

      while (await statement.step()) {
        yield mapCadRow<TAttributes>(await statement.getRow<CadDatasetRow>());
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

  async insert(feature: CadFeature<TAttributes>): Promise<void> {
    const userFields = await this.getFields();
    const columnNames = [
      "SmID",
      "SmUserID",
      "SmGeometry",
      ...userFields.map((field) => field.name)
    ];
    const placeholders = columnNames.map(() => "?").join(", ");
    const geometry = CadGeometryCodec.write(feature.geometry);
    const sql = `INSERT INTO "${this.info.tableName}" (${columnNames.map((column) => `"${column}"`).join(", ")}) VALUES (${placeholders})`;
    const params: SqlValue[] = [
      feature.id,
      0,
      geometry,
      ...userFields.map(
        (field) =>
          (feature.attributes[field.name] as SqlValue | undefined) ?? null
      )
    ];

    await this.driver.transaction(async () => {
      await executeSql(this.driver, sql, params);
      await this.registerRepository.incrementObjectCount(
        this.info.id,
        geometry.byteLength
      );
    });
  }

  async insertMany(
    features: Iterable<CadFeature<TAttributes>> | AsyncIterable<CadFeature<TAttributes>>
  ): Promise<void> {
    const userFields = await this.getFields();
    const columnNames = [
      "SmID",
      "SmUserID",
      "SmGeometry",
      ...userFields.map((field) => field.name)
    ];
    const placeholders = columnNames.map(() => "?").join(", ");
    const sql = `INSERT INTO "${this.info.tableName}" (${columnNames.map((column) => `"${column}"`).join(", ")}) VALUES (${placeholders})`;

    await this.driver.transaction(async () => {
      const statement = await this.driver.prepare(sql);
      try {
        let count = 0;
        let maxGeometrySize = 0;

        for await (const feature of features) {
          const geometry = CadGeometryCodec.write(feature.geometry);
          maxGeometrySize = Math.max(maxGeometrySize, geometry.byteLength);
          const params: SqlValue[] = [
            feature.id,
            0,
            geometry,
            ...userFields.map(
              (field) =>
                (feature.attributes[field.name] as SqlValue | undefined) ?? null
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
      geometry?: CadGeometry;
      attributes?: Partial<TAttributes>;
    }
  ): Promise<void> {
    if (!changes.geometry && !changes.attributes) {
      return;
    }

    const setClauses: string[] = [];
    const params: SqlValue[] = [];

    if (changes.geometry) {
      setClauses.push('"SmGeometry" = ?');
      params.push(CadGeometryCodec.write(changes.geometry));
    }

    if (changes.attributes) {
      const validEntries = await this.checkedAttributeEntries(changes.attributes);
      for (const [key, value] of validEntries) {
        setClauses.push(`"${key}" = ?`);
        params.push(value as SqlValue);
      }
    }

    if (setClauses.length === 0) {
      return;
    }

    params.push(id);
    await this.driver.transaction(async () => {
      await this.ensureObjectExists(id);
      await executeSql(
        this.driver,
        `UPDATE "${this.info.tableName}" SET ${setClauses.join(", ")} WHERE SmID = ?`,
        params
      );
    });
  }

  async delete(id: number): Promise<void> {
    await this.driver.transaction(async () => {
      await this.ensureObjectExists(id);
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
      readonly fields?: readonly FieldInfo[];
    }
  ): Promise<CadDataset> {
    const fields = params.fields ?? [];
    const datasetId = await registerRepository.insert({
      name: params.name,
      kind: "cad",
      srid: 0,
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

    if (fields.length > 0) {
      const fieldInfoRepository = new SmFieldInfoRepository(driver);
      await fieldInfoRepository.insertAll(datasetId, fields);
    }

    return new CadDataset(driver, {
      id: datasetId,
      name: params.name,
      kind: "cad",
      tableName: params.name,
      srid: 0,
      objectCount: 0,
      geometryType: null
    });
  }
}

import { SmFieldInfoRepository } from "../schema/SmFieldInfoRepository";
import { SmRegisterRepository } from "../schema/SmRegisterRepository";
import { executeSql, executeStatement, queryAll, queryOne } from "../sql/SqlHelpers";
import type { SqlDriver, SqlValue } from "../sql/SqlDriver";
import type { DatasetInfo, FieldInfo, QueryOptions, TabularRecord } from "../types";
import { BaseDataset } from "./BaseDataset";
import { buildListSql, sqliteColumnType } from "./vectorDatasetShared";

interface TabularDatasetRow extends Record<string, unknown> {
  readonly SmID: number;
}

const SYSTEM_COLUMN_PREFIX = "Sm";

function mapTabularRow<TAttributes extends Record<string, unknown>>(
  row: TabularDatasetRow
): TabularRecord<TAttributes> {
  const { SmID, ...rest } = row;

  const attributes: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rest)) {
    if (!key.startsWith(SYSTEM_COLUMN_PREFIX)) {
      attributes[key] = value;
    }
  }

  return {
    id: SmID,
    attributes: attributes as TAttributes
  };
}

export interface TabularDatasetReadable {
  readonly info: DatasetInfo;
  getFields(): Promise<readonly FieldInfo[]>;
  getById(id: number): Promise<TabularRecord | null>;
  list(options?: QueryOptions): Promise<readonly TabularRecord[]>;
  iterate(options?: QueryOptions): AsyncIterable<TabularRecord>;
  count(): Promise<number>;
}

export interface TabularDatasetWritable extends TabularDatasetReadable {
  insert(record: TabularRecord): Promise<void>;
  insertMany(
    records: Iterable<TabularRecord> | AsyncIterable<TabularRecord>
  ): Promise<void>;
  update(id: number, attributes: Record<string, unknown>): Promise<void>;
  delete(id: number): Promise<void>;
}

export class TabularDataset<
    TAttributes extends Record<string, unknown> = Record<string, unknown>
  >
  extends BaseDataset
  implements TabularDatasetWritable
{
  private readonly registerRepository: SmRegisterRepository;

  constructor(driver: SqlDriver, info: DatasetInfo) {
    super(driver, info);
    this.registerRepository = new SmRegisterRepository(driver);
  }

  async getById(id: number): Promise<TabularRecord<TAttributes> | null> {
    const row = await queryOne<TabularDatasetRow>(
      this.driver,
      `SELECT * FROM "${this.info.tableName}" WHERE SmID = ?`,
      [id]
    );

    return row ? mapTabularRow<TAttributes>(row) : null;
  }

  async list(
    options?: QueryOptions
  ): Promise<readonly TabularRecord<TAttributes>[]> {
    const { sql, params } = buildListSql(this.info.tableName, options);
    const rows = await queryAll<TabularDatasetRow>(this.driver, sql, params);
    return rows.map((row) => mapTabularRow<TAttributes>(row));
  }

  async *iterate(
    options?: QueryOptions
  ): AsyncIterable<TabularRecord<TAttributes>> {
    const { sql, params } = buildListSql(this.info.tableName, options);
    const statement = await this.driver.prepare(sql);

    try {
      if (params.length > 0) {
        await statement.bind(params);
      }

      while (await statement.step()) {
        yield mapTabularRow<TAttributes>(
          await statement.getRow<TabularDatasetRow>()
        );
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

  async insert(record: TabularRecord<TAttributes>): Promise<void> {
    const userFields = await this.getFields();
    const columnNames = [
      "SmID",
      "SmUserID",
      ...userFields.map((field) => field.name)
    ];
    const placeholders = columnNames.map(() => "?").join(", ");
    const sql = `INSERT INTO "${this.info.tableName}" (${columnNames.map((column) => `"${column}"`).join(", ")}) VALUES (${placeholders})`;
    const params: SqlValue[] = [
      record.id,
      0,
      ...userFields.map(
        (field) =>
          (record.attributes[field.name] as SqlValue | undefined) ?? null
      )
    ];

    await this.driver.transaction(async () => {
      await executeSql(this.driver, sql, params);
      await this.registerRepository.incrementObjectCount(this.info.id);
    });
  }

  async insertMany(
    records: Iterable<TabularRecord<TAttributes>> | AsyncIterable<TabularRecord<TAttributes>>
  ): Promise<void> {
    const userFields = await this.getFields();
    const columnNames = [
      "SmID",
      "SmUserID",
      ...userFields.map((field) => field.name)
    ];
    const placeholders = columnNames.map(() => "?").join(", ");
    const sql = `INSERT INTO "${this.info.tableName}" (${columnNames.map((column) => `"${column}"`).join(", ")}) VALUES (${placeholders})`;

    await this.driver.transaction(async () => {
      const statement = await this.driver.prepare(sql);
      try {
        let count = 0;

        for await (const record of records) {
          const params: SqlValue[] = [
            record.id,
            0,
            ...userFields.map(
              (field) =>
                (record.attributes[field.name] as SqlValue | undefined) ?? null
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
            0
          );
        }
      } finally {
        await statement.finalize();
      }
    });
  }

  async update(
    id: number,
    attributes: Record<string, unknown>
  ): Promise<void> {
    const userFields = await this.getFields();
    const fieldNames = new Set(userFields.map((f) => f.name));
    const validEntries = Object.entries(attributes).filter(([key]) =>
      fieldNames.has(key)
    );
    if (validEntries.length === 0) return;

    const keys = validEntries.map(([key]) => key);
    const setClauses = keys.map((key) => `"${key}" = ?`).join(", ");
    const sql = `UPDATE "${this.info.tableName}" SET ${setClauses} WHERE SmID = ?`;
    const params: SqlValue[] = [
      ...keys.map((key) => attributes[key] as SqlValue),
      id
    ];

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
      readonly fields?: readonly FieldInfo[];
    }
  ): Promise<TabularDataset> {
    const fields = params.fields ?? [];
    const datasetId = await registerRepository.insert({
      name: params.name,
      kind: "tabular",
      srid: 0,
      idColumnName: "SmID",
      geometryColumnName: null
    });

    const userColumnDefinitions = fields.map((field) => {
      const nullability = field.nullable ? "" : " NOT NULL";
      return `"${field.name}" ${sqliteColumnType(field)}${nullability}`;
    });

    const createTableParts = [
      `"SmID" INTEGER NOT NULL PRIMARY KEY`,
      `"SmUserID" INTEGER DEFAULT 0 NOT NULL`,
      ...userColumnDefinitions
    ];

    await driver.exec(
      `CREATE TABLE "${params.name}" (${createTableParts.join(", ")})`
    );

    if (fields.length > 0) {
      const fieldInfoRepository = new SmFieldInfoRepository(driver);
      await fieldInfoRepository.insertAll(datasetId, fields);
    }

    return new TabularDataset(driver, {
      id: datasetId,
      name: params.name,
      kind: "tabular",
      tableName: params.name,
      srid: 0,
      objectCount: 0,
      geometryType: null
    });
  }
}

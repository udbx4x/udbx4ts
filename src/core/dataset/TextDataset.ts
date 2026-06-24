import type { SqlDriver } from "../sql/SqlDriver";
import type { SqlValue } from "../sql/SqlDriver";
import { GeoTextCodec } from "../geometry/geotext/GeoTextCodec";
import { executeSql, queryAll, queryOne } from "../sql/SqlHelpers";
import type { DatasetInfo, FieldInfo, QueryOptions, TextGeometry } from "../types";
import { BaseDataset } from "./BaseDataset";
import type { WritableDataset } from "./Dataset";
import { buildListSql, normalizeGeometryBlob } from "./vectorDatasetShared";
import { SmRegisterRepository } from "../schema/SmRegisterRepository";
import { BinaryWriter } from "../utils/BinaryWriter";

export type TextFeature<
  TAttributes extends Record<string, unknown> = Record<string, unknown>
> = {
  readonly id: number;
  readonly geometry: TextGeometry;
  readonly attributes: TAttributes;
};

interface TextDatasetRow extends Record<string, unknown> {
  readonly SmID: number;
  readonly SmGeometry: Uint8Array | ArrayBuffer;
}

function mapTextRow<TAttributes extends Record<string, unknown>>(
  row: TextDatasetRow
): TextFeature<TAttributes> {
  const {
    SmID,
    SmUserID: _smUserId,
    SmGeometry,
    SmIndexKey: _smIndexKey,
    ...attributes
  } = row;

  return {
    id: SmID,
    geometry: GeoTextCodec.decode(normalizeGeometryBlob(SmGeometry)),
    attributes: attributes as TAttributes
  };
}

/**
 * 文本数据集实现（DatasetKind="text"）。
 *
 * <p>对应白皮书 §3.1.5（文本数据集）。
 */
export class TextDataset<
    TAttributes extends Record<string, unknown> = Record<string, unknown>
  >
  extends BaseDataset
  implements WritableDataset<TextFeature<TAttributes>>
{
  private readonly registerRepository: SmRegisterRepository;

  constructor(driver: SqlDriver, info: DatasetInfo) {
    super(driver, info);
    this.registerRepository = new SmRegisterRepository(driver);
  }

  override async getFields(): Promise<readonly FieldInfo[]> {
    const fields = await super.getFields();
    return fields.filter((field) => !field.name.startsWith("Sm"));
  }

  async getById(id: number): Promise<TextFeature<TAttributes>> {
    const row = await queryOne<TextDatasetRow>(
      this.driver,
      `SELECT * FROM "${this.info.tableName}" WHERE SmID = ?`,
      [id]
    );

    if (!row) {
      throw this.objectNotFound(id);
    }
    return mapTextRow<TAttributes>(row);
  }

  async list(
    options?: QueryOptions
  ): Promise<readonly TextFeature<TAttributes>[]> {
    const { sql, params } = buildListSql(this.info.tableName, options);
    const rows = await queryAll<TextDatasetRow>(this.driver, sql, params);
    return rows.map((row) => mapTextRow<TAttributes>(row));
  }

  async *iterate(
    options?: QueryOptions
  ): AsyncIterable<TextFeature<TAttributes>> {
    const { sql, params } = buildListSql(this.info.tableName, options);
    const statement = await this.driver.prepare(sql);

    try {
      if (params.length > 0) {
        await statement.bind(params);
      }

      while (await statement.step()) {
        yield mapTextRow<TAttributes>(await statement.getRow<TextDatasetRow>());
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

  async insert(feature: TextFeature<TAttributes>): Promise<void> {
    const userFields = await this.getFields();
    const columnNames = [
      "SmID",
      "SmUserID",
      "SmGeometry",
      "SmIndexKey",
      ...userFields.map((field) => field.name)
    ];
    const placeholders = columnNames.map(() => "?").join(", ");
    const geometry = GeoTextCodec.encode(feature.geometry);
    const indexKey = encodeTextIndexKey(feature.geometry, this.info.srid ?? 0);
    const sql = `INSERT INTO "${this.info.tableName}" (${columnNames.map((column) => `"${column}"`).join(", ")}) VALUES (${placeholders})`;
    const params: SqlValue[] = [
      feature.id,
      0,
      geometry,
      indexKey,
      ...userFields.map(
        (field) => (feature.attributes[field.name] as SqlValue | undefined) ?? null
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
    features: Iterable<TextFeature<TAttributes>> | AsyncIterable<TextFeature<TAttributes>>
  ): Promise<void> {
    const userFields = await this.getFields();
    const columnNames = [
      "SmID",
      "SmUserID",
      "SmGeometry",
      "SmIndexKey",
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
          const geometry = GeoTextCodec.encode(feature.geometry);
          const indexKey = encodeTextIndexKey(feature.geometry, this.info.srid ?? 0);
          maxGeometrySize = Math.max(maxGeometrySize, geometry.byteLength);
          const params: SqlValue[] = [
            feature.id,
            0,
            geometry,
            indexKey,
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
      geometry?: TextGeometry;
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
      params.push(GeoTextCodec.encode(changes.geometry));
      setClauses.push('"SmIndexKey" = ?');
      params.push(encodeTextIndexKey(changes.geometry, this.info.srid ?? 0));
    }

    if (changes.attributes) {
      const validEntries = await this.checkedAttributeEntries(changes.attributes);
      for (const [key, value] of validEntries) {
        setClauses.push(`"${key}" = ?`);
        params.push((value as SqlValue | undefined) ?? null);
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
}

function encodeTextIndexKey(
  geometry: TextGeometry,
  srid: number
): Uint8Array {
  const fontHeight = geometry.style?.fontHeight ?? 0.406494140625;
  const halfSize = Math.max(Math.abs(fontHeight), 0.01) / 2;
  const minX = geometry.anchor[0] - halfSize;
  const minY = geometry.anchor[1] - halfSize;
  const maxX = geometry.anchor[0] + halfSize;
  const maxY = geometry.anchor[1] + halfSize;

  return encodeGaiaPolygon(
    [
      [minX, minY],
      [maxX, minY],
      [maxX, maxY],
      [minX, maxY],
      [minX, minY]
    ],
    srid
  );
}

function encodeGaiaPolygon(
  points: ReadonlyArray<readonly [number, number]>,
  srid: number
): Uint8Array {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const writer = new BinaryWriter();

  writer.writeUint8(0x00);
  writer.writeUint8(0x01);
  writer.writeInt32(srid);
  writer.writeFloat64(Math.min(...xs));
  writer.writeFloat64(Math.min(...ys));
  writer.writeFloat64(Math.max(...xs));
  writer.writeFloat64(Math.max(...ys));
  writer.writeUint8(0x7c);
  writer.writeInt32(3);
  writer.writeInt32(0);
  writer.writeInt32(points.length);

  for (const [x, y] of points) {
    writer.writeFloat64(x);
    writer.writeFloat64(y);
  }

  writer.writeUint8(0xfe);
  return writer.toUint8Array();
}

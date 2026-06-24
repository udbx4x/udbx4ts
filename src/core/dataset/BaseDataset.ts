import type { SqlDriver } from "../sql/SqlDriver";
import type { DatasetInfo, FieldInfo } from "../types";
import { SmFieldInfoRepository } from "../schema/SmFieldInfoRepository";
import { UdbxNotFoundError } from "../errors";
import type { Dataset } from "./Dataset";
import { queryOne } from "../sql/SqlHelpers";

export abstract class BaseDataset implements Dataset {
  protected readonly fieldInfoRepository: SmFieldInfoRepository;

  constructor(
    protected readonly driver: SqlDriver,
    readonly info: DatasetInfo
  ) {
    this.fieldInfoRepository = new SmFieldInfoRepository(driver);
  }

  getFields(): Promise<readonly FieldInfo[]> {
    return this.fieldInfoRepository.findByDatasetId(this.info.id);
  }

  protected objectNotFound(id: number): UdbxNotFoundError {
    return new UdbxNotFoundError(this.info.name, id);
  }

  protected fieldNotFound(name: string): UdbxNotFoundError {
    return new UdbxNotFoundError(name);
  }

  protected async ensureObjectExists(id: number): Promise<void> {
    const row = await queryOne<{ readonly SmID: number }>(
      this.driver,
      `SELECT SmID FROM "${this.info.tableName}" WHERE SmID = ?`,
      [id]
    );

    if (!row) {
      throw this.objectNotFound(id);
    }
  }

  protected async checkedAttributeEntries(
    attributes: Record<string, unknown>
  ): Promise<readonly (readonly [string, unknown])[]> {
    const userFields = await this.getFields();
    const fieldNames = new Set(userFields.map((field) => field.name));

    for (const key of Object.keys(attributes)) {
      if (!fieldNames.has(key)) {
        throw this.fieldNotFound(key);
      }
    }

    return Object.entries(attributes);
  }
}

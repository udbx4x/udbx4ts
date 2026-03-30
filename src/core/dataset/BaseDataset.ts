import type { SqlDriver } from "../sql/SqlDriver";
import type { DatasetInfo, FieldInfo } from "../types";
import { SmFieldInfoRepository } from "../schema/SmFieldInfoRepository";
import type { DatasetInfoProvider } from "./Dataset";

export abstract class BaseDataset implements DatasetInfoProvider {
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
}

import type { SqlDriver } from "../sql/SqlDriver";
import type { DatasetInfo, FieldInfo, Feature } from "../types";
import { SmFieldInfoRepository } from "../schema/SmFieldInfoRepository";
import type { Dataset } from "./Dataset";

export abstract class BaseDataset<TFeature extends Feature = Feature>
  implements Dataset<TFeature> {
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


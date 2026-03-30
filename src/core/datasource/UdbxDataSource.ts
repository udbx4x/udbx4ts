import { LineDataset } from "../dataset/LineDataset";
import { PointDataset } from "../dataset/PointDataset";
import { RegionDataset } from "../dataset/RegionDataset";
import { TabularDataset } from "../dataset/TabularDataset";
import { UdbxSchemaInitializer } from "../schema/UdbxSchemaInitializer";
import { SmRegisterRepository } from "../schema/SmRegisterRepository";
import type { SqlDriver, SqlOpenTarget } from "../sql/SqlDriver";
import type { DatasetInfo, FieldInfo } from "../types";

export type UdbxRuntime = "browser" | "electron" | "unknown";
export type UdbxDataset = PointDataset | LineDataset | RegionDataset | TabularDataset;

export class UdbxDataSource {
  private readonly registerRepository: SmRegisterRepository;

  constructor(
    private readonly driver: SqlDriver,
    readonly runtime: UdbxRuntime = "unknown"
  ) {
    this.registerRepository = new SmRegisterRepository(driver);
  }

  static async open(params: {
    readonly driver: SqlDriver;
    readonly target: SqlOpenTarget;
    readonly runtime?: UdbxRuntime;
  }): Promise<UdbxDataSource> {
    await params.driver.open(params.target);
    return new UdbxDataSource(params.driver, params.runtime ?? "unknown");
  }

  static async create(params: {
    readonly driver: SqlDriver;
    readonly target: SqlOpenTarget;
    readonly runtime?: UdbxRuntime;
  }): Promise<UdbxDataSource> {
    await params.driver.open(params.target);
    await UdbxSchemaInitializer.initialize(params.driver);
    return new UdbxDataSource(params.driver, params.runtime ?? "unknown");
  }

  async listDatasets(): Promise<readonly DatasetInfo[]> {
    return this.registerRepository.findAll();
  }

  async getDataset(name: string): Promise<UdbxDataset | null> {
    const info = await this.registerRepository.findByName(name);

    if (!info) {
      return null;
    }

    switch (info.kind) {
      case "point":
        return new PointDataset(this.driver, info);
      case "line":
        return new LineDataset(this.driver, info);
      case "region":
        return new RegionDataset(this.driver, info);
      case "tabular":
        return new TabularDataset(this.driver, info);
      default:
        return null;
    }
  }

  async createPointDataset(
    name: string,
    srid: number,
    fields?: readonly FieldInfo[]
  ): Promise<PointDataset> {
    return this.driver.transaction(async () => {
      const params =
        fields === undefined
          ? { name, srid }
          : { name, srid, fields };

      return PointDataset.create(this.driver, this.registerRepository, params);
    });
  }

  async createLineDataset(
    name: string,
    srid: number,
    fields?: readonly FieldInfo[]
  ): Promise<LineDataset> {
    return this.driver.transaction(async () => {
      const params =
        fields === undefined
          ? { name, srid }
          : { name, srid, fields };

      return LineDataset.create(this.driver, this.registerRepository, params);
    });
  }

  async createRegionDataset(
    name: string,
    srid: number,
    fields?: readonly FieldInfo[]
  ): Promise<RegionDataset> {
    return this.driver.transaction(async () => {
      const params =
        fields === undefined
          ? { name, srid }
          : { name, srid, fields };

      return RegionDataset.create(this.driver, this.registerRepository, params);
    });
  }

  async createTabularDataset(
    name: string,
    fields?: readonly FieldInfo[]
  ): Promise<TabularDataset> {
    return this.driver.transaction(async () => {
      const params =
        fields === undefined
          ? { name }
          : { name, fields };

      return TabularDataset.create(this.driver, this.registerRepository, params);
    });
  }

  async close(): Promise<void> {
    await this.driver.close();
  }
}

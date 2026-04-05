import { CadDataset } from "../dataset/CadDataset";
import { LineDataset } from "../dataset/LineDataset";
import { LineZDataset } from "../dataset/LineZDataset";
import { PointDataset } from "../dataset/PointDataset";
import { PointZDataset } from "../dataset/PointZDataset";
import { RegionDataset } from "../dataset/RegionDataset";
import { RegionZDataset } from "../dataset/RegionZDataset";
import { TabularDataset } from "../dataset/TabularDataset";
import { TextDataset } from "../dataset/TextDataset";
import { SmFieldInfoRepository } from "../schema/SmFieldInfoRepository";
import { UdbxSchemaInitializer } from "../schema/UdbxSchemaInitializer";
import { SmRegisterRepository } from "../schema/SmRegisterRepository";
import type { SqlDriver, SqlOpenTarget } from "../sql/SqlDriver";
import type { DatasetInfo, FieldInfo } from "../types";

export type UdbxRuntime = "browser" | "electron" | "unknown";
export type UdbxDataset =
  | PointDataset
  | PointZDataset
  | LineDataset
  | LineZDataset
  | RegionDataset
  | RegionZDataset
  | TabularDataset
  | TextDataset
  | CadDataset;

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
      case "pointZ":
        return new PointZDataset(this.driver, info);
      case "line":
        return new LineDataset(this.driver, info);
      case "lineZ":
        return new LineZDataset(this.driver, info);
      case "region":
        return new RegionDataset(this.driver, info);
      case "regionZ":
        return new RegionZDataset(this.driver, info);
      case "tabular":
        return new TabularDataset(this.driver, info);
      case "text":
        return new TextDataset(this.driver, info);
      case "cad":
        return new CadDataset(this.driver, info);
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

  async createPointZDataset(
    name: string,
    srid: number,
    fields?: readonly FieldInfo[]
  ): Promise<PointZDataset> {
    return this.driver.transaction(async () => {
      const params =
        fields === undefined
          ? { name, srid }
          : { name, srid, fields };

      return PointZDataset.create(this.driver, this.registerRepository, params);
    });
  }

  async createLineZDataset(
    name: string,
    srid: number,
    fields?: readonly FieldInfo[]
  ): Promise<LineZDataset> {
    return this.driver.transaction(async () => {
      const params =
        fields === undefined
          ? { name, srid }
          : { name, srid, fields };

      return LineZDataset.create(this.driver, this.registerRepository, params);
    });
  }

  async createRegionZDataset(
    name: string,
    srid: number,
    fields?: readonly FieldInfo[]
  ): Promise<RegionZDataset> {
    return this.driver.transaction(async () => {
      const params =
        fields === undefined
          ? { name, srid }
          : { name, srid, fields };

      return RegionZDataset.create(this.driver, this.registerRepository, params);
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

  async createTextDataset(
    name: string,
    srid: number,
    fields?: readonly FieldInfo[]
  ): Promise<TextDataset> {
    return this.driver.transaction(async () => {
      const fieldList = fields ?? [];

      const datasetId = await this.registerRepository.insert({
        name,
        kind: "text",
        srid,
        idColumnName: "SmID",
        geometryColumnName: "SmGeometry"
      });

      const userColumnDefinitions = fieldList.map((field) => {
        const nullability = field.nullable ? "" : " NOT NULL";
        return `"${field.name}" TEXT${nullability}`;
      });

      const createTableParts = [
        `"SmID" INTEGER NOT NULL PRIMARY KEY`,
        `"SmUserID" INTEGER DEFAULT 0 NOT NULL`,
        `"SmGeometry" BLOB`,
        `"SmIndexKey" POLYGON`,
        ...userColumnDefinitions
      ];

      await this.driver.exec(
        `CREATE TABLE "${name}" (${createTableParts.join(", ")})`
      );

      if (fieldList.length > 0) {
        const fieldInfoRepository = new SmFieldInfoRepository(this.driver);
        await fieldInfoRepository.insertAll(datasetId, fieldList);
      }

      return new TextDataset(this.driver, {
        id: datasetId,
        name,
        kind: "text",
        tableName: name,
        srid,
        objectCount: 0,
        geometryType: null
      });
    });
  }

  async createCadDataset(
    name: string,
    fields?: readonly FieldInfo[]
  ): Promise<CadDataset> {
    return this.driver.transaction(async () => {
      const fieldList = fields ?? [];

      const datasetId = await this.registerRepository.insert({
        name,
        kind: "cad",
        srid: 0,
        idColumnName: "SmID",
        geometryColumnName: "SmGeometry"
      });

      const userColumnDefinitions = fieldList.map((field) => {
        const nullability = field.nullable ? "" : " NOT NULL";
        return `"${field.name}" TEXT${nullability}`;
      });

      const createTableParts = [
        `"SmID" INTEGER NOT NULL PRIMARY KEY`,
        `"SmUserID" INTEGER DEFAULT 0 NOT NULL`,
        `"SmGeometry" BLOB`,
        ...userColumnDefinitions
      ];

      await this.driver.exec(
        `CREATE TABLE "${name}" (${createTableParts.join(", ")})`
      );

      if (fieldList.length > 0) {
        const fieldInfoRepository = new SmFieldInfoRepository(this.driver);
        await fieldInfoRepository.insertAll(datasetId, fieldList);
      }

      return new CadDataset(this.driver, {
        id: datasetId,
        name,
        kind: "cad",
        tableName: name,
        srid: 0,
        objectCount: 0,
        geometryType: null
      });
    });
  }

  async close(): Promise<void> {
    await this.driver.close();
  }
}

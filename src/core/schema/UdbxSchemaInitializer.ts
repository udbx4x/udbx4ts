import type { SqlDriver } from "../sql/SqlDriver";

export const UDBX_SYSTEM_TABLES = [
  "spatial_ref_sys",
  "geometry_columns",
  "SmDataSourceInfo",
  "SmRegister",
  "SmFieldInfo"
] as const;

export const UDBX_SCHEMA_STATEMENTS = [
  `CREATE TABLE spatial_ref_sys (
    srid INTEGER NOT NULL PRIMARY KEY,
    auth_name TEXT NOT NULL,
    auth_srid INTEGER NOT NULL,
    ref_sys_name TEXT NOT NULL DEFAULT 'Unknown',
    proj4text TEXT NOT NULL,
    srtext TEXT NOT NULL DEFAULT 'Undefined'
  )`,
  `CREATE TABLE geometry_columns (
    f_table_name TEXT NOT NULL,
    f_geometry_column TEXT NOT NULL,
    geometry_type INTEGER NOT NULL,
    coord_dimension INTEGER NOT NULL,
    srid INTEGER NOT NULL,
    spatial_index_enabled INTEGER NOT NULL,
    CONSTRAINT pk_geom_cols PRIMARY KEY (f_table_name, f_geometry_column)
  )`,
  `CREATE TABLE SmDataSourceInfo (
    SmFlag INTEGER DEFAULT 0 NOT NULL PRIMARY KEY AUTOINCREMENT,
    SmVersion INTEGER,
    SmDsDescription TEXT,
    SmProjectInfo BLOB,
    SmLastUpdateTime DATE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    SmDataFormat INTEGER DEFAULT 0 NOT NULL
  )`,
  `CREATE TABLE SmRegister (
    SmDatasetID INTEGER DEFAULT 0 NOT NULL PRIMARY KEY,
    SmDatasetName TEXT,
    SmTableName TEXT,
    SmOption INTEGER,
    SmEncType INTEGER,
    SmParentDTID INTEGER DEFAULT 0 NOT NULL,
    SmDatasetType INTEGER,
    SmObjectCount INTEGER DEFAULT 0 NOT NULL,
    SmLeft REAL,
    SmRight REAL,
    SmTop REAL,
    SmBottom REAL,
    SmIDColName TEXT,
    SmGeoColName TEXT,
    SmMinZ REAL,
    SmMaxZ REAL,
    SmSRID INTEGER DEFAULT 0,
    SmIndexType INTEGER DEFAULT 1,
    SmToleRanceFuzzy REAL,
    SmToleranceDAngle REAL,
    SmToleranceNodeSnap REAL,
    SmToleranceSmallPolygon REAL,
    SmToleranceGrain REAL,
    SmMaxGeometrySize INTEGER DEFAULT 0 NOT NULL,
    SmOptimizeCount INTEGER DEFAULT 0 NOT NULL,
    SmOptimizeRatio REAL,
    SmDescription TEXT,
    SmExtInfo TEXT,
    SmCreateTime TEXT,
    SmLastUpdateTime TEXT,
    SmProjectInfo BLOB
  )`,
  `CREATE TABLE SmFieldInfo (
    SmID INTEGER DEFAULT 0 NOT NULL PRIMARY KEY AUTOINCREMENT,
    SmDatasetID INTEGER,
    SmFieldName TEXT,
    SmFieldCaption TEXT,
    SmFieldType INTEGER,
    SmFieldFormat TEXT,
    SmFieldSign INTEGER,
    SmFieldDomain TEXT,
    SmFieldUpdatable INTEGER,
    SmFieldbRequired INTEGER,
    SmFieldDefaultValue TEXT,
    SmFieldSize INTEGER
  )`,
  "INSERT INTO SmDataSourceInfo (SmVersion, SmDataFormat) VALUES (0, 1)",
  "INSERT INTO spatial_ref_sys (srid, auth_name, auth_srid, ref_sys_name, proj4text, srtext) VALUES (0, 'none', 0, 'Undefined', '', 'Undefined')",
  `INSERT INTO spatial_ref_sys (srid, auth_name, auth_srid, ref_sys_name, proj4text, srtext)
   VALUES (
    4326,
    'epsg',
    4326,
    'WGS 84',
    '+proj=longlat +datum=WGS84 +no_defs',
    'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433],AUTHORITY["EPSG","4326"]]'
   )`
] as const;

export class UdbxSchemaInitializer {
  static async isInitialized(driver: SqlDriver): Promise<boolean> {
    const statement = await driver.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1"
    );

    try {
      await statement.bind(["SmDataSourceInfo"]);
      return statement.step();
    } finally {
      await statement.finalize();
    }
  }

  static async ensureInitialized(driver: SqlDriver): Promise<boolean> {
    const initialized = await this.isInitialized(driver);
    if (initialized) {
      return false;
    }

    await this.initialize(driver);
    return true;
  }

  static async initialize(driver: SqlDriver): Promise<void> {
    await driver.exec("PRAGMA journal_mode = WAL");
    await driver.transaction(async () => {
      for (const statement of UDBX_SCHEMA_STATEMENTS) {
        await driver.exec(statement);
      }
    });
  }
}

import { UdbxDataSource } from "../../core/datasource/UdbxDataSource";
import { UdbxSchemaInitializer } from "../../core/schema/UdbxSchemaInitializer";
import type { SqlDriver } from "../../core/sql/SqlDriver";
import type {
  BrowserSqlOpenTargetOptions
} from "../sqlite/resolveBrowserSqlOpenTarget";
import { resolveBrowserSqlOpenTarget } from "../sqlite/resolveBrowserSqlOpenTarget";
import { BrowserWorkerRuntime } from "./BrowserWorkerRuntime";

export interface CreateBrowserWorkerRuntimeOptions {
  readonly createDriver: () => Promise<SqlDriver> | SqlDriver;
  readonly openTarget?: Omit<BrowserSqlOpenTargetOptions, "preferOpfs">;
}

interface DriverWithExport {
  exportDatabase(): Promise<Uint8Array>;
}

interface DriverWithImport {
  importDatabase(target: Parameters<SqlDriver["open"]>[0], binary: Uint8Array): Promise<void>;
}

interface BrowserManagedDataSource extends UdbxDataSource {
  __exportDatabase?: () => Promise<Uint8Array>;
}

export function createBrowserWorkerRuntime(
  options: CreateBrowserWorkerRuntimeOptions
): BrowserWorkerRuntime {
  const createManagedDataSource = async (params: {
    readonly preferOpfs?: boolean;
    readonly binary?: Uint8Array;
  }): Promise<UdbxDataSource> => {
    const driver = await options.createDriver();
    const target = resolveBrowserSqlOpenTarget({
      ...options.openTarget,
      ...(params.preferOpfs === undefined ? {} : { preferOpfs: params.preferOpfs })
    });

    if (params.binary !== undefined) {
      if (
        !("importDatabase" in driver) ||
        typeof (driver as DriverWithImport).importDatabase !== "function"
      ) {
        throw new Error("Current browser SQL driver does not support import.");
      }

      await (driver as DriverWithImport).importDatabase(target, params.binary);
    }

    await driver.open(target);

    if (params.binary === undefined) {
      await UdbxSchemaInitializer.ensureInitialized(driver);
    }

    const dataSource = new UdbxDataSource(driver, "browser") as BrowserManagedDataSource;

    if (
      "exportDatabase" in driver &&
      typeof (driver as DriverWithExport).exportDatabase === "function"
    ) {
      dataSource.__exportDatabase = () =>
        (driver as DriverWithExport).exportDatabase();
    }

    return dataSource;
  };

  return new BrowserWorkerRuntime({
    createDataSource: ({ preferOpfs }) =>
      createManagedDataSource({
        ...(preferOpfs === undefined ? {} : { preferOpfs })
      }),
    replaceDataSource: ({ preferOpfs, binary }) =>
      createManagedDataSource({
        binary: binary instanceof Uint8Array ? binary : new Uint8Array(binary),
        ...(preferOpfs === undefined ? {} : { preferOpfs })
      })
  });
}

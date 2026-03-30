import { UdbxDataSource } from "../core/datasource/UdbxDataSource";
import { BetterSqlite3Driver } from "./BetterSqlite3Driver";
import { existsSync } from "node:fs";

export interface ElectronUdbxOptions {
  readonly path: string;
  readonly readonly?: boolean;
}

export async function createElectronUdbx(
  options: ElectronUdbxOptions
): Promise<UdbxDataSource> {
  const driver = new BetterSqlite3Driver();
  const fileExists = existsSync(options.path);

  if (fileExists) {
    return UdbxDataSource.open({
      driver,
      target: { kind: "file", path: options.path },
      runtime: "electron"
    });
  }

  return UdbxDataSource.create({
    driver,
    target: { kind: "file", path: options.path },
    runtime: "electron"
  });
}

export { BetterSqlite3Driver } from "./BetterSqlite3Driver";

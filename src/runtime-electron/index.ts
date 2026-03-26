import type { UdbxDataSource } from "../core/datasource/UdbxDataSource";
import { createNotImplementedError } from "../core/utils/errors";

export interface ElectronUdbxOptions {
  readonly path: string;
  readonly readonly?: boolean;
}

export async function createElectronUdbx(
  _options: ElectronUdbxOptions
): Promise<UdbxDataSource> {
  throw createNotImplementedError("createElectronUdbx");
}


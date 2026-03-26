import {
  createUdbxBlob,
  downloadBinaryFile,
  readBlobAsUint8Array,
  saveBinaryWithPickerOrDownload,
  writeBinaryToFileHandle
} from "./browserFileIO";

export interface BrowserWorkspaceDataSource {
  importDatabase(binary: Uint8Array, options?: { readonly preferOpfs?: boolean }): Promise<void>;
  exportDatabase(): Promise<Uint8Array>;
}

export interface BrowserImportFromFileOptions {
  readonly preferOpfs?: boolean;
}

export async function importUdbxFromFile(
  dataSource: BrowserWorkspaceDataSource,
  file: Blob,
  options: BrowserImportFromFileOptions = {}
): Promise<void> {
  const binary = await readBlobAsUint8Array(file);
  await dataSource.importDatabase(binary, options);
}

export async function exportUdbxToBlob(
  dataSource: BrowserWorkspaceDataSource
): Promise<Blob> {
  const binary = await dataSource.exportDatabase();
  return createUdbxBlob(binary);
}

export async function saveUdbxToFileHandle(
  dataSource: BrowserWorkspaceDataSource,
  handle: FileSystemFileHandle
): Promise<void> {
  const binary = await dataSource.exportDatabase();
  await writeBinaryToFileHandle(handle, binary);
}

export async function downloadUdbxFile(
  dataSource: BrowserWorkspaceDataSource,
  filename: string
): Promise<void> {
  const binary = await dataSource.exportDatabase();
  downloadBinaryFile(binary, filename);
}

export async function saveUdbxWithPickerOrDownload(
  dataSource: BrowserWorkspaceDataSource,
  filename: string
): Promise<"picker" | "download"> {
  const binary = await dataSource.exportDatabase();
  return saveBinaryWithPickerOrDownload(binary, filename);
}

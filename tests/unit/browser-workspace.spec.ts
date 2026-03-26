import { describe, expect, it } from "vitest";

import {
  exportUdbxToBlob,
  importUdbxFromFile,
  saveUdbxWithPickerOrDownload
} from "../../src/runtime-browser/fs/browserWorkspace";

class FakeWorkspaceDataSource {
  imported: Uint8Array | null = null;
  readonly exported = new Uint8Array([9, 8, 7, 6]);

  async importDatabase(binary: Uint8Array): Promise<void> {
    this.imported = binary;
  }

  async exportDatabase(): Promise<Uint8Array> {
    return this.exported;
  }
}

describe("browser workspace helpers", () => {
  it("imports database from file blob", async () => {
    const ds = new FakeWorkspaceDataSource();
    const file = new Blob([new Uint8Array([1, 2, 3])], {
      type: "application/octet-stream"
    });

    await importUdbxFromFile(ds, file, { preferOpfs: false });

    expect(ds.imported).not.toBeNull();
    expect(Array.from(ds.imported ?? [])).toEqual([1, 2, 3]);
  });

  it("exports database to blob", async () => {
    const ds = new FakeWorkspaceDataSource();

    const blob = await exportUdbxToBlob(ds);
    const binary = new Uint8Array(await blob.arrayBuffer());

    expect(Array.from(binary)).toEqual([9, 8, 7, 6]);
  });

  it("saves with picker when available", async () => {
    const ds = new FakeWorkspaceDataSource();
    let written: Uint8Array | null = null;

    Object.defineProperty(globalThis, "showSaveFilePicker", {
      configurable: true,
      value: async () =>
        ({
          createWritable: async () =>
            ({
              write: async (chunk: Uint8Array) => {
                written = chunk;
              },
              close: async () => {}
            }) as FileSystemWritableFileStream
        }) as FileSystemFileHandle
    });

    const mode = await saveUdbxWithPickerOrDownload(ds, "workspace.udbx");
    delete (globalThis as Record<string, unknown>).showSaveFilePicker;

    expect(mode).toBe("picker");
    expect(Array.from(written ?? [])).toEqual([9, 8, 7, 6]);
  });
});

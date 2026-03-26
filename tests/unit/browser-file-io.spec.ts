import { describe, expect, it } from "vitest";

import {
  createUdbxBlob,
  readBlobAsUint8Array,
  saveBinaryWithPickerOrDownload,
  supportsFileSystemAccess
} from "../../src/runtime-browser/fs/browserFileIO";

describe("browser file I/O helpers", () => {
  it("reads blob as Uint8Array", async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3, 4])]);
    const binary = await readBlobAsUint8Array(blob);

    expect(Array.from(binary)).toEqual([1, 2, 3, 4]);
  });

  it("creates blob from Uint8Array", async () => {
    const blob = createUdbxBlob(new Uint8Array([5, 6, 7]));
    const binary = new Uint8Array(await blob.arrayBuffer());

    expect(Array.from(binary)).toEqual([5, 6, 7]);
    expect(blob.type).toBe("application/octet-stream");
  });

  it("detects file system access API capabilities", () => {
    expect(supportsFileSystemAccess({})).toBe(false);
    expect(
      supportsFileSystemAccess({
        showOpenFilePicker: () => Promise.resolve([]),
        showSaveFilePicker: () => Promise.resolve({})
      })
    ).toBe(true);
  });

  it("uses save picker when available", async () => {
    let written: Uint8Array | null = null;
    const mode = await saveBinaryWithPickerOrDownload(new Uint8Array([1, 9, 8]), "demo.udbx", {
      pickerProbe: {
        showSaveFilePicker: async () =>
          ({
            createWritable: async () =>
              ({
                write: async (chunk: Uint8Array) => {
                  written = chunk;
                },
                close: async () => {}
              }) as FileSystemWritableFileStream
          }) as FileSystemFileHandle
      }
    });

    expect(mode).toBe("picker");
    expect(Array.from(written ?? [])).toEqual([1, 9, 8]);
  });

  it("falls back to download when save picker is unavailable", async () => {
    let clicked = false;

    const fakeAnchor = {
      href: "",
      download: "",
      style: { display: "" },
      click: () => {
        clicked = true;
      }
    };
    const fakeDocument = {
      createElement: () => fakeAnchor,
      body: {
        appendChild: () => {},
        removeChild: () => {}
      }
    } as unknown as Document;
    const fakeUrl = {
      createObjectURL: () => "blob:demo",
      revokeObjectURL: () => {}
    };

    const mode = await saveBinaryWithPickerOrDownload(new Uint8Array([1, 2]), "fallback.udbx", {
      pickerProbe: {},
      downloadEnv: {
        document: fakeDocument,
        URL: fakeUrl
      }
    });

    expect(mode).toBe("download");
    expect(clicked).toBe(true);
  });
});

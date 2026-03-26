export interface BrowserGlobalProbe {
  readonly showOpenFilePicker?: unknown;
  readonly showSaveFilePicker?: unknown;
}

export interface BrowserSavePickerProbe {
  showSaveFilePicker?: ((options?: { suggestedName?: string }) => Promise<FileSystemFileHandle>) | undefined;
}

export interface DownloadEnvironment {
  readonly document: Document;
  readonly URL: Pick<typeof URL, "createObjectURL" | "revokeObjectURL">;
}

function toArrayBufferView(binary: Uint8Array): Uint8Array<ArrayBuffer> {
  const view = new Uint8Array(binary.byteLength);
  view.set(binary);
  return view;
}

export function supportsFileSystemAccess(
  probe: BrowserGlobalProbe = globalThis as unknown as BrowserGlobalProbe
): boolean {
  return (
    typeof probe.showOpenFilePicker === "function" &&
    typeof probe.showSaveFilePicker === "function"
  );
}

export async function readBlobAsUint8Array(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

export function createUdbxBlob(binary: Uint8Array): Blob {
  return new Blob([toArrayBufferView(binary)], { type: "application/octet-stream" });
}

export async function writeBinaryToFileHandle(
  handle: FileSystemFileHandle,
  binary: Uint8Array
): Promise<void> {
  const writable = await handle.createWritable();
  try {
    await writable.write(toArrayBufferView(binary));
  } finally {
    await writable.close();
  }
}

export function downloadBinaryFile(
  binary: Uint8Array,
  filename: string,
  env: DownloadEnvironment = {
    document: globalThis.document,
    URL: globalThis.URL
  }
): void {
  const blob = createUdbxBlob(binary);
  const url = env.URL.createObjectURL(blob);
  const anchor = env.document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  env.document.body.appendChild(anchor);
  anchor.click();
  env.document.body.removeChild(anchor);
  env.URL.revokeObjectURL(url);
}

export async function saveBinaryWithPickerOrDownload(
  binary: Uint8Array,
  filename: string,
  options: {
    readonly pickerProbe?: BrowserSavePickerProbe;
    readonly downloadEnv?: DownloadEnvironment;
  } = {}
): Promise<"picker" | "download"> {
  const probe = options.pickerProbe ?? (globalThis as unknown as BrowserSavePickerProbe);
  if (typeof probe.showSaveFilePicker === "function") {
    const handle = await probe.showSaveFilePicker({
      suggestedName: filename
    });
    await writeBinaryToFileHandle(handle, binary);
    return "picker";
  }

  if (options.downloadEnv === undefined) {
    downloadBinaryFile(binary, filename);
  } else {
    downloadBinaryFile(binary, filename, options.downloadEnv);
  }
  return "download";
}

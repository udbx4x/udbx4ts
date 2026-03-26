import type { SqlOpenTarget } from "../../core/sql/SqlDriver";

export interface BrowserCapabilityProbe {
  readonly navigator?: {
    readonly storage?: {
      readonly getDirectory?: (() => Promise<FileSystemDirectoryHandle>) | undefined;
    };
  };
}

export interface BrowserRuntimeCapabilities {
  readonly hasOpfs: boolean;
}

export interface BrowserSqlOpenTargetOptions {
  readonly preferOpfs?: boolean;
  readonly opfsPath?: string;
  readonly memoryName?: string;
  readonly capabilities?: BrowserRuntimeCapabilities;
  readonly capabilityProbe?: BrowserCapabilityProbe;
}

export function isOpfsAvailable(
  probe: BrowserCapabilityProbe = globalThis as unknown as BrowserCapabilityProbe
): boolean {
  return typeof probe.navigator?.storage?.getDirectory === "function";
}

export function resolveBrowserSqlOpenTarget(
  options: BrowserSqlOpenTargetOptions = {}
): SqlOpenTarget {
  const capabilities = options.capabilities ?? {
    hasOpfs: isOpfsAvailable(options.capabilityProbe)
  };

  const preferOpfs = options.preferOpfs ?? true;

  if (preferOpfs && capabilities.hasOpfs) {
    return {
      kind: "opfs",
      path: options.opfsPath ?? "udbx/default.udbx"
    };
  }

  if (options.memoryName === undefined) {
    return { kind: "memory" };
  }

  return {
    kind: "memory",
    name: options.memoryName
  };
}

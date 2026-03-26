import { describe, expect, it } from "vitest";

import {
  isOpfsAvailable,
  resolveBrowserSqlOpenTarget
} from "../../src/runtime-browser/sqlite/resolveBrowserSqlOpenTarget";

describe("resolveBrowserSqlOpenTarget", () => {
  it("uses OPFS target when preferred and supported", () => {
    const target = resolveBrowserSqlOpenTarget({
      preferOpfs: true,
      opfsPath: "workspace/demo.udbx",
      capabilities: { hasOpfs: true }
    });

    expect(target).toEqual({
      kind: "opfs",
      path: "workspace/demo.udbx"
    });
  });

  it("falls back to memory target when OPFS is unavailable", () => {
    const target = resolveBrowserSqlOpenTarget({
      preferOpfs: true,
      memoryName: "fallback-db",
      capabilities: { hasOpfs: false }
    });

    expect(target).toEqual({
      kind: "memory",
      name: "fallback-db"
    });
  });

  it("detects OPFS capability from probe shape", () => {
    expect(isOpfsAvailable({})).toBe(false);
    expect(
      isOpfsAvailable({
        navigator: { storage: { getDirectory: async () => ({}) as FileSystemDirectoryHandle } }
      })
    ).toBe(true);
  });
});

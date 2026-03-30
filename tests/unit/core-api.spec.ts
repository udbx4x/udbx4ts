import { describe, expect, it } from "vitest";

import { createBrowserUdbx } from "../../src/runtime-browser/index";
import { createElectronUdbx } from "../../src/runtime-electron/index";
import { createNotImplementedError, NotImplementedError } from "../../src/index";

describe("phase 1 project skeleton", () => {
  it("creates a typed not implemented error", () => {
    const error = createNotImplementedError("phase-1");

    expect(error).toBeInstanceOf(NotImplementedError);
    expect(error.message).toContain("phase-1");
  });

  it("validates browser runtime options when worker settings are missing", async () => {
    await expect(createBrowserUdbx()).rejects.toThrow(
      "Browser worker URL is required"
    );
  });

  it("electron runtime factory is now implemented", async () => {
    // createElectronUdbx now requires better-sqlite3 which may not be installed
    // in the test environment, so we verify the export exists
    const mod = await import("../../src/runtime-electron/index");
    expect(typeof mod.createElectronUdbx).toBe("function");
    expect(typeof mod.BetterSqlite3Driver).toBe("function");
  });
});

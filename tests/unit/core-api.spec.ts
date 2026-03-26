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

  it("marks electron runtime factory as pending implementation", async () => {
    await expect(
      createElectronUdbx({ path: "/tmp/example.udbx" })
    ).rejects.toThrow(NotImplementedError);
  });
});

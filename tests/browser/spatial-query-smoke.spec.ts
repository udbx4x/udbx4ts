import { expect, test } from "@playwright/test";

test("browser worker supports querySpatial through RPC", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/spatial-smoke.html");

  const result = await page.evaluate(async () => {
    const run = (window as unknown as {
      __runSpatialSmoke?: () => Promise<{
        ids: readonly number[];
        strategy: string;
        hasMore: boolean;
      }>;
    }).__runSpatialSmoke;
    if (!run) {
      throw new Error("__runSpatialSmoke is not installed");
    }
    return run();
  });

  expect(result).toEqual({
    ids: [1],
    strategy: "envelope_cache",
    hasMore: false
  });
});

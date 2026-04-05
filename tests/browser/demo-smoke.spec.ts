import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { UdbxDataSource } from "../../src/core/datasource/UdbxDataSource";
import { NodeSqliteDriver } from "../support/NodeSqliteDriver";

async function createImportFixture(): Promise<string> {
  const filePath = join(tmpdir(), `udbx-import-${randomUUID()}.udbx`);
  const driver = new NodeSqliteDriver();
  const ds = await UdbxDataSource.create({
    driver,
    target: { kind: "file", path: filePath },
    runtime: "unknown"
  });

  await ds.createPointDataset("ImportedPOI", 4326, [
    { name: "NAME", fieldType: "text", nullable: false }
  ]);
  await ds.close();

  return filePath;
}

test("browser demo supports initialize and create dataset workflow", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "udbx4ts Browser Demo" })).toBeVisible();

  await page.getByRole("button", { name: "1. 初始化数据库" }).click();
  await expect(page.locator("#logs")).toContainText("数据库已初始化。", {
    timeout: 30_000
  });

  await page.getByRole("button", { name: "3. 创建示例数据集" }).click();
  await expect(page.locator("#logs")).toContainText("DemoPOI", {
    timeout: 30_000
  });
  await expect(page.locator("#datasets")).toContainText("DemoPOI");
});

test("browser demo imports .udbx file and refreshes dataset list", async ({ page }) => {
  const fixture = await createImportFixture();

  try {
    await page.goto("/");

    await page.locator("#file-input").setInputFiles(fixture);

    await expect(page.locator("#logs")).toContainText("已导入文件", {
      timeout: 30_000
    });
    await expect(page.locator("#datasets")).toContainText("ImportedPOI", {
      timeout: 30_000
    });
  } finally {
    await rm(fixture, { force: true });
  }
});

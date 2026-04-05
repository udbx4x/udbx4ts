import {
  createBrowserUdbx,
  importUdbxFromFile,
  saveUdbxWithPickerOrDownload,
  type BrowserUdbxDataSource
} from "../../src/runtime-browser";

const logs = document.querySelector<HTMLPreElement>("#logs");
const datasetsView = document.querySelector<HTMLPreElement>("#datasets");
const openBtn = document.querySelector<HTMLButtonElement>("#open-btn");
const createBtn = document.querySelector<HTMLButtonElement>("#create-btn");
const exportBtn = document.querySelector<HTMLButtonElement>("#export-btn");
const fileInput = document.querySelector<HTMLInputElement>("#file-input");

let ds: BrowserUdbxDataSource | null = null;

function log(message: string): void {
  if (!logs) {
    return;
  }

  const now = new Date().toLocaleTimeString();
  logs.textContent = `[${now}] ${message}\n${logs.textContent ?? ""}`;
}

async function refreshDatasets(): Promise<void> {
  if (!ds || !datasetsView) {
    return;
  }

  const datasets = await ds.listDatasets();
  datasetsView.textContent = JSON.stringify(datasets, null, 2);
}

async function ensureDataSource(): Promise<BrowserUdbxDataSource> {
  if (ds) {
    return ds;
  }

  const worker = new Worker(new URL("./worker.ts", import.meta.url), {
    type: "module"
  });

  ds = await createBrowserUdbx({
    workerFactory: () => worker,
    preferOpfs: true
  });
  log("数据库已初始化。");
  await refreshDatasets();
  return ds;
}

openBtn?.addEventListener("click", async () => {
  try {
    await ensureDataSource();
  } catch (error) {
    log(`初始化失败: ${String(error)}`);
  }
});

fileInput?.addEventListener("change", async () => {
  try {
    const file = fileInput.files?.[0];
    if (!file) {
      return;
    }
    const db = await ensureDataSource();
    await importUdbxFromFile(db, file, { preferOpfs: true });
    log(`已导入文件: ${file.name}`);
    await refreshDatasets();
  } catch (error) {
    log(`导入失败: ${String(error)}`);
  } finally {
    fileInput.value = "";
  }
});

createBtn?.addEventListener("click", async () => {
  try {
    const db = await ensureDataSource();
    await db.createPointDataset("DemoPOI", 4326, [
      { name: "NAME", fieldType: "text", nullable: false }
    ]);
    log("已创建示例点数据集 DemoPOI。");
    await refreshDatasets();
  } catch (error) {
    log(`创建失败: ${String(error)}`);
  }
});

exportBtn?.addEventListener("click", async () => {
  try {
    const db = await ensureDataSource();
    const mode = await saveUdbxWithPickerOrDownload(db, "exported.udbx");
    if (mode === "picker") {
      log("已通过系统保存对话框导出数据库。");
    } else {
      log("浏览器不支持保存对话框，已回退为下载 exported.udbx");
    }
  } catch (error) {
    log(`导出失败: ${String(error)}`);
  }
});

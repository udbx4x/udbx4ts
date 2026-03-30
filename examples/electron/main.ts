import { app, BrowserWindow, ipcMain, dialog } from "electron";
import * as path from "node:path";
import { createElectronUdbx } from "udbx4ts/electron";
import type { UdbxDataSource, UdbxDataset, TabularDataset } from "udbx4ts";

let mainWindow: BrowserWindow | null = null;
let dataSource: UdbxDataSource | null = null;

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile("index.html");
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ── IPC handlers ──────────────────────────────────────────────────────────

ipcMain.handle("udbx:open", async () => {
  const result = await dialog.showOpenDialog({
    filters: [{ name: "UDBX Database", extensions: ["udbx"] }],
    properties: ["openFile"]
  });

  if (result.canceled || result.filePaths.length === 0) return null;

  if (dataSource) {
    await dataSource.close();
    dataSource = null;
  }

  dataSource = await createElectronUdbx({ path: result.filePaths[0] });
  const datasets = await dataSource.listDatasets();

  return {
    path: result.filePaths[0],
    datasets: datasets.map((d) => ({
      id: d.id,
      name: d.name,
      kind: d.kind,
      objectCount: d.objectCount
    }))
  };
});

ipcMain.handle("udbx:create", async () => {
  const result = await dialog.showSaveDialog({
    filters: [{ name: "UDBX Database", extensions: ["udbx"] }]
  });

  if (result.canceled || !result.filePath) return null;

  if (dataSource) {
    await dataSource.close();
    dataSource = null;
  }

  dataSource = await createElectronUdbx({ path: result.filePath });
  return { path: result.filePath, datasets: [] };
});

ipcMain.handle("udbx:listDatasets", async () => {
  if (!dataSource) throw new Error("No database is open.");
  const datasets = await dataSource.listDatasets();
  return datasets.map((d) => ({
    id: d.id,
    name: d.name,
    kind: d.kind,
    objectCount: d.objectCount,
    srid: d.srid
  }));
});

ipcMain.handle(
  "udbx:createDataset",
  async (_event, kind: string, name: string, srid?: number) => {
    if (!dataSource) throw new Error("No database is open.");

    switch (kind) {
      case "point":
        return (await dataSource.createPointDataset(name, srid ?? 4326)).info;
      case "line":
        return (await dataSource.createLineDataset(name, srid ?? 4326)).info;
      case "region":
        return (await dataSource.createRegionDataset(name, srid ?? 4326)).info;
      case "tabular":
        return (await dataSource.createTabularDataset(name)).info;
      default:
        throw new Error(`Unsupported dataset kind: ${kind}`);
    }
  }
);

ipcMain.handle(
  "udbx:getFeatures",
  async (_event, datasetName: string, limit?: number, offset?: number) => {
    if (!dataSource) throw new Error("No database is open.");

    const dataset = await dataSource.getDataset(datasetName);
    if (!dataset) throw new Error(`Dataset "${datasetName}" not found.`);

    const options =
      limit !== undefined ? { limit, offset: offset ?? 0 } : undefined;

    if ("list" in dataset && typeof dataset.list === "function") {
      const features = await dataset.list(options);
      return features.map((f: { id: number; geometry?: { type: string; coordinates: unknown }; attributes?: Record<string, unknown> }) => ({
        id: f.id,
        geometry: f.geometry
          ? { type: f.geometry.type, coordinates: f.geometry.coordinates }
          : undefined,
        attributes: f.attributes ?? {}
      }));
    }

    if ("getById" in dataset && typeof dataset.getById === "function") {
      const record = await (dataset as TabularDataset).getById(0);
      return record ? [record] : [];
    }

    return [];
  }
);

ipcMain.handle(
  "udbx:insertFeature",
  async (_event, datasetName: string, feature: any) => {
    if (!dataSource) throw new Error("No database is open.");

    const dataset = await dataSource.getDataset(datasetName);
    if (!dataset) throw new Error(`Dataset "${datasetName}" not found.`);

    if ("insert" in dataset && typeof dataset.insert === "function") {
      await dataset.insert(feature);
      return true;
    }

    throw new Error("Dataset does not support insert.");
  }
);

// ── App lifecycle ─────────────────────────────────────────────────────────

app.whenReady().then(createWindow);

app.on("window-all-closed", async () => {
  if (dataSource) {
    await dataSource.close();
    dataSource = null;
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

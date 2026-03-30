import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("udbx", {
  open: () => ipcRenderer.invoke("udbx:open"),
  create: () => ipcRenderer.invoke("udbx:create"),
  listDatasets: () => ipcRenderer.invoke("udbx:listDatasets"),
  createDataset: (kind: string, name: string, srid?: number) =>
    ipcRenderer.invoke("udbx:createDataset", kind, name, srid),
  getFeatures: (datasetName: string, limit?: number, offset?: number) =>
    ipcRenderer.invoke("udbx:getFeatures", datasetName, limit, offset),
  insertFeature: (datasetName: string, feature: any) =>
    ipcRenderer.invoke("udbx:insertFeature", datasetName, feature)
});

export const RPC_METHODS = {
  udbxOpen: "udbx.open",
  udbxClose: "udbx.close",
  udbxListDatasets: "udbx.listDatasets",
  udbxGetDatasetInfo: "udbx.getDatasetInfo",
  udbxExportDatabase: "udbx.exportDatabase",
  udbxImportDatabase: "udbx.importDatabase",
  udbxCreatePointDataset: "udbx.createPointDataset",
  udbxCreateLineDataset: "udbx.createLineDataset",
  udbxCreateRegionDataset: "udbx.createRegionDataset",
  datasetGetFields: "dataset.getFields",
  datasetGetById: "dataset.getById",
  datasetList: "dataset.list",
  datasetInsert: "dataset.insert",
  datasetInsertMany: "dataset.insertMany"
} as const;

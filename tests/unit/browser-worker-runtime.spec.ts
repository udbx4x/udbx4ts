import { describe, expect, it } from "vitest";

import { UdbxDataSource } from "../../src/core/datasource/UdbxDataSource";
import { BrowserWorkerRuntime } from "../../src/runtime-browser/worker/BrowserWorkerRuntime";
import { RPC_METHODS } from "../../src/shared-runtime/rpc/methods";
import type { RuntimeRequest, RuntimeResponse } from "../../src/shared-runtime/rpc/protocol";
import { NodeSqliteDriver } from "../support/NodeSqliteDriver";

async function createRuntimeWithCitiesDataset(): Promise<BrowserWorkerRuntime> {
  return new BrowserWorkerRuntime({
    createDataSource: async () => {
      const driver = new NodeSqliteDriver();
      const ds = await UdbxDataSource.create({
        driver,
        target: { kind: "memory", name: "browser-worker-test" },
        runtime: "browser"
      });

      await ds.createPointDataset("Cities", 4326, [
        { name: "NAME", fieldType: "text", nullable: false }
      ]);

      return ds;
    }
  });
}

async function createRuntimeWithImportSupport(): Promise<BrowserWorkerRuntime> {
  const createWithName = async (name: string): Promise<UdbxDataSource> => {
    const driver = new NodeSqliteDriver();
    const ds = await UdbxDataSource.create({
      driver,
      target: { kind: "memory", name: "browser-worker-import-test" },
      runtime: "browser"
    });

    await ds.createPointDataset(name, 4326, [
      { name: "NAME", fieldType: "text", nullable: false }
    ]);
    return ds;
  };

  return new BrowserWorkerRuntime({
    createDataSource: async () => createWithName("BeforeImport"),
    replaceDataSource: async () => createWithName("AfterImport")
  });
}

async function callRpc(
  runtime: BrowserWorkerRuntime,
  method: string,
  params?: unknown
): Promise<RuntimeResponse> {
  const request: RuntimeRequest = {
    id: `${method}-id`,
    method,
    ...(params === undefined ? {} : { params })
  };
  return runtime.handle(request);
}

describe("BrowserWorkerRuntime", () => {
  it("opens runtime and lists datasets", async () => {
    const runtime = await createRuntimeWithCitiesDataset();

    const open = await callRpc(runtime, RPC_METHODS.udbxOpen, { preferOpfs: true });
    const list = await callRpc(runtime, RPC_METHODS.udbxListDatasets);

    expect(open).toMatchObject({
      ok: true,
      result: { runtime: "browser" }
    });
    expect(list).toMatchObject({
      ok: true
    });
    if (list.ok) {
      expect(list.result).toHaveLength(1);
    }
  });

  it("supports point insert and getById through RPC methods", async () => {
    const runtime = await createRuntimeWithCitiesDataset();
    await callRpc(runtime, RPC_METHODS.udbxOpen);

    const insert = await callRpc(runtime, RPC_METHODS.datasetInsert, {
      datasetName: "Cities",
      feature: {
        id: 1,
        geometry: { type: "Point", coordinates: [116.123, 39.456] },
        attributes: { NAME: "Beijing" }
      }
    });

    const get = await callRpc(runtime, RPC_METHODS.datasetGetById, {
      datasetName: "Cities",
      id: 1
    });

    expect(insert.ok).toBe(true);
    expect(get).toMatchObject({
      ok: true
    });
    if (get.ok) {
      expect(get.result).toMatchObject({
        id: 1,
        attributes: { NAME: "Beijing" }
      });
    }
  });

  it("returns an explicit error when dataset is missing", async () => {
    const runtime = await createRuntimeWithCitiesDataset();
    await callRpc(runtime, RPC_METHODS.udbxOpen);

    const response = await callRpc(runtime, RPC_METHODS.datasetGetFields, {
      datasetName: "MissingDataset"
    });

    expect(response).toMatchObject({
      ok: false,
      error: { code: "dataset_not_found" }
    });
  });

  it("creates point dataset through RPC and can query metadata", async () => {
    const runtime = await createRuntimeWithCitiesDataset();
    await callRpc(runtime, RPC_METHODS.udbxOpen);

    const created = await callRpc(runtime, RPC_METHODS.udbxCreatePointDataset, {
      name: "POI",
      srid: 4326,
      fields: [{ name: "NAME", fieldType: "text", nullable: false }]
    });

    const info = await callRpc(runtime, RPC_METHODS.udbxGetDatasetInfo, {
      name: "POI"
    });

    expect(created).toMatchObject({
      ok: true
    });
    expect(info).toMatchObject({
      ok: true
    });
    if (info.ok) {
      expect(info.result).toMatchObject({
        name: "POI",
        kind: "point",
        srid: 4326
      });
    }
  });

  it("returns unsupported_operation when export is unavailable", async () => {
    const runtime = await createRuntimeWithCitiesDataset();
    await callRpc(runtime, RPC_METHODS.udbxOpen);

    const exported = await callRpc(runtime, RPC_METHODS.udbxExportDatabase);

    expect(exported).toMatchObject({
      ok: false,
      error: { code: "unsupported_operation" }
    });
  });

  it("imports database through replaceDataSource pipeline", async () => {
    const runtime = await createRuntimeWithImportSupport();
    await callRpc(runtime, RPC_METHODS.udbxOpen);

    const before = await callRpc(runtime, RPC_METHODS.udbxGetDatasetInfo, {
      name: "BeforeImport"
    });
    const imported = await callRpc(runtime, RPC_METHODS.udbxImportDatabase, {
      binary: new Uint8Array([1, 2, 3, 4]),
      preferOpfs: false
    });
    const after = await callRpc(runtime, RPC_METHODS.udbxGetDatasetInfo, {
      name: "AfterImport"
    });

    expect(before).toMatchObject({ ok: true });
    expect(imported).toMatchObject({ ok: true });
    expect(after).toMatchObject({ ok: true });
    if (after.ok) {
      expect(after.result).toMatchObject({ name: "AfterImport" });
    }
  });
});

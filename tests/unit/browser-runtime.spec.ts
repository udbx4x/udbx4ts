import { describe, expect, it } from "vitest";

import { createBrowserUdbx } from "../../src/runtime-browser";
import { RPC_METHODS } from "../../src/shared-runtime/rpc/methods";

interface MockMessageEvent {
  readonly data: unknown;
}

class MockWorker {
  private listener: ((event: MockMessageEvent) => void) | null = null;
  terminated = false;
  readonly received: unknown[] = [];

  addEventListener(
    _type: "message",
    listener: (event: MockMessageEvent) => void
  ): void {
    this.listener = listener;
  }

  removeEventListener(
    _type: "message",
    listener: (event: MockMessageEvent) => void
  ): void {
    if (this.listener === listener) {
      this.listener = null;
    }
  }

  terminate(): void {
    this.terminated = true;
  }

  postMessage(message: unknown): void {
    this.received.push(message);

    const request = message as {
      readonly id: string;
      readonly method: string;
      readonly params?: Record<string, unknown>;
    };

    if (!this.listener) {
      return;
    }

    let result: unknown = null;

    switch (request.method) {
      case RPC_METHODS.udbxOpen:
        result = { runtime: "browser" };
        break;
      case RPC_METHODS.udbxListDatasets:
        result = [
          {
            id: 1,
            name: "Cities",
            kind: "point",
            tableName: "Cities",
            srid: 4326,
            objectCount: 1,
            geometryType: 1
          }
        ];
        break;
      case RPC_METHODS.udbxGetDatasetInfo:
        if (request.params?.name === "Cities") {
          result = {
            id: 1,
            name: "Cities",
            kind: "point",
            tableName: "Cities",
            srid: 4326,
            objectCount: 1,
            geometryType: 1
          };
        } else {
          result = null;
        }
        break;
      case RPC_METHODS.udbxCreatePointDataset:
        result = {
          id: 2,
          name: request.params?.name,
          kind: "point",
          tableName: request.params?.name,
          srid: request.params?.srid,
          objectCount: 0,
          geometryType: 1
        };
        break;
      case RPC_METHODS.udbxExportDatabase:
        result = new Uint8Array([0x55, 0x44, 0x42, 0x58]);
        break;
      case RPC_METHODS.udbxImportDatabase:
        result = undefined;
        break;
      case RPC_METHODS.datasetGetById:
        result = {
          id: 1,
          geometry: { type: "Point", coordinates: [116.123, 39.456] },
          attributes: { NAME: "Beijing" }
        };
        break;
      case RPC_METHODS.udbxClose:
        result = undefined;
        break;
      default:
        result = undefined;
        break;
    }

    this.listener({
      data: {
        id: request.id,
        ok: true,
        result
      }
    });
  }
}

describe("runtime-browser client", () => {
  it("creates a browser datasource through worker transport", async () => {
    const worker = new MockWorker();
    const ds = await createBrowserUdbx({
      workerFactory: () => worker,
      preferOpfs: true
    });

    const datasets = await ds.listDatasets();
    const dataset = await ds.getDataset("Cities");
    const feature = await dataset?.getById(1);
    const created = await ds.createPointDataset("POI", 4326, [
      { name: "NAME", fieldType: "text", nullable: false }
    ]);
    const binary = await ds.exportDatabase();
    await ds.importDatabase(new Uint8Array([1, 2, 3]), { preferOpfs: false });
    await ds.close();

    expect(datasets).toHaveLength(1);
    expect(feature).toMatchObject({
      id: 1,
      attributes: { NAME: "Beijing" }
    });
    expect(created.info).toMatchObject({
      name: "POI",
      kind: "point",
      srid: 4326
    });
    expect(Array.from(binary)).toEqual([0x55, 0x44, 0x42, 0x58]);
    expect(
      worker.received.some(
        (item) =>
          (item as { method?: string }).method === RPC_METHODS.udbxCreatePointDataset
      )
    ).toBe(true);
    expect(
      worker.received.some(
        (item) =>
          (item as { method?: string }).method === RPC_METHODS.udbxExportDatabase
      )
    ).toBe(true);
    expect(
      worker.received.some(
        (item) =>
          (item as { method?: string }).method === RPC_METHODS.udbxImportDatabase
      )
    ).toBe(true);
    expect(worker.terminated).toBe(true);
  });

  it("fails early when worker options are missing", async () => {
    await expect(createBrowserUdbx()).rejects.toThrow(
      "Browser worker URL is required"
    );
  });
});

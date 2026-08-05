import { createBrowserUdbx } from "../../src/runtime-browser";

export interface SpatialSmokeResult {
  readonly ids: readonly number[];
  readonly strategy: string;
  readonly hasMore: boolean;
}

declare global {
  interface Window {
    __runSpatialSmoke?: () => Promise<SpatialSmokeResult>;
  }
}

window.__runSpatialSmoke = async (): Promise<SpatialSmokeResult> => {
  const worker = new Worker(new URL("./worker.ts", import.meta.url), {
    type: "module"
  });
  const ds = await createBrowserUdbx({ workerFactory: () => worker });

  try {
    await ds.createPointDataset("Points", 4326);
    const dataset = (await ds.getDataset("Points")) as {
      insert(feature: unknown): Promise<void>;
    };
    await dataset.insert({
      id: 1,
      geometry: { type: "Point", coordinates: [1, 1], srid: 4326 },
      attributes: {}
    });
    await dataset.insert({
      id: 2,
      geometry: { type: "Point", coordinates: [10, 10], srid: 4326 },
      attributes: {}
    });

    const spatial = await ds.querySpatial("Points", {
      bounds: { minX: 0, minY: 0, maxX: 5, maxY: 5 },
      limit: 10
    });

    return {
      ids: spatial.features.map((feature) => feature.id),
      strategy: spatial.strategy,
      hasMore: spatial.hasMore
    };
  } finally {
    await ds.close();
  }
};

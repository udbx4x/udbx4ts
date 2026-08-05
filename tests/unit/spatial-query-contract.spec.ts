import { describe, expect, it } from "vitest";

import type {
  SpatialQueryOptions,
  SpatialQueryReason,
  SpatialQueryResult,
  SpatialQueryStrategy
} from "../../src/core/types";

// 类型级负向门禁：若 union 被放宽或字段被改变，以下 @ts-expect-error 会编译失败。

// @ts-expect-error bounded_sample 不属于 SDK 成功策略
const forbiddenStrategy: SpatialQueryStrategy = "bounded_sample";

// @ts-expect-error 非稳定原因码不得进入 union
const forbiddenReason: SpatialQueryReason = "degraded";

// @ts-expect-error 缺少 bounds 不合法
const missingBounds: SpatialQueryOptions = { limit: 10 };

describe("spatial query contract types", () => {
  it("keeps strategy union aligned with udbx4spec", () => {
    const values: readonly SpatialQueryStrategy[] = [
      "rtree",
      "envelope_cache"
    ];
    expect(values).toEqual(["rtree", "envelope_cache"]);
  });

  it("keeps reason union aligned with udbx4spec", () => {
    const values: readonly SpatialQueryReason[] = [
      "invalid_viewport",
      "spatial_index_unavailable",
      "envelope_cache_budget_exceeded",
      "query_timeout",
      "corrupt_geometry",
      "unsupported_dataset_kind"
    ];
    expect(values).toEqual([
      "invalid_viewport",
      "spatial_index_unavailable",
      "envelope_cache_budget_exceeded",
      "query_timeout",
      "corrupt_geometry",
      "unsupported_dataset_kind"
    ]);
  });

  it("shapes SpatialQueryOptions and SpatialQueryResult per contract", () => {
    const options: SpatialQueryOptions = {
      bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
      limit: 10,
      requiredIds: [1, 2]
    };
    expect(options.bounds).toEqual({ minX: 0, minY: 0, maxX: 1, maxY: 1 });
    expect(options.limit).toBe(10);
    expect(options.requiredIds).toEqual([1, 2]);

    const result: SpatialQueryResult = {
      features: [],
      queriedBounds: options.bounds,
      strategy: "envelope_cache",
      hasMore: false
    };
    expect(result.strategy).toBe("envelope_cache");
    expect(result.hasMore).toBe(false);
  });
});

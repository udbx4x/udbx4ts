import type { Feature } from "./Feature";

/**
 * 视口空间查询契约类型，与 `udbx4spec/reference/typescript/udbx4spec.d.ts`
 * 保持一致。
 */
export interface BoundingBox {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/**
 * SDK 成功策略仅两种；`bounded_sample` 是 Viewer 工具层私有预览策略，
 * 不属于 SDK 空间查询成功结果。
 */
export type SpatialQueryStrategy = "rtree" | "envelope_cache";

/** 失败原因与 capability 诊断使用的稳定原因码。 */
export type SpatialQueryReason =
  | "invalid_viewport"
  | "spatial_index_unavailable"
  | "envelope_cache_budget_exceeded"
  | "query_timeout"
  | "corrupt_geometry"
  | "unsupported_dataset_kind";

export interface SpatialQueryOptions {
  readonly bounds: BoundingBox;
  readonly limit: number;
  readonly requiredIds?: readonly number[];
  /** TypeScript 运行时便利扩展（取消支持），不属于跨语言契约字段。 */
  readonly signal?: AbortSignal;
}

export interface SpatialQueryResult<
  TFeature extends Feature = Feature
> {
  readonly features: readonly TFeature[];
  readonly queriedBounds: BoundingBox;
  readonly strategy: SpatialQueryStrategy;
  readonly hasMore: boolean;
}

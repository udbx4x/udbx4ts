import { SpatialQueryError, UdbxNotFoundError } from "../errors";
import { CadGeometryCodec } from "../geometry/cad/CadGeometryCodec";
import { GaiaGeometryCodec } from "../geometry/gaia/GaiaGeometryCodec";
import { GeoTextCodec } from "../geometry/geotext/GeoTextCodec";
import { SmRegisterRepository } from "../schema/SmRegisterRepository";
import { queryAll } from "../sql/SqlHelpers";
import type { SqlDriver } from "../sql/SqlDriver";
import type {
  BoundingBox,
  DatasetInfo,
  DatasetKind,
  Feature,
  Geometry,
  SpatialQueryOptions,
  SpatialQueryResult
} from "../types";
import {
  detectSpatialCapability,
  quoteIdentifier,
  type DetectedSpatialCapability
} from "./spatialCapability";

export interface NormalizedSpatialQueryOptions {
  readonly bounds: BoundingBox;
  readonly limit: number;
  readonly requiredIds: readonly number[];
}

/** 校验并规范化视口查询选项；非法输入以 `invalid_viewport` 失败。 */
export function normalizeSpatialQueryOptions(
  options: SpatialQueryOptions
): NormalizedSpatialQueryOptions {
  const bounds = options.bounds;
  if (
    !Number.isFinite(bounds.minX) ||
    !Number.isFinite(bounds.minY) ||
    !Number.isFinite(bounds.maxX) ||
    !Number.isFinite(bounds.maxY)
  ) {
    throw new SpatialQueryError(
      "invalid_viewport",
      "spatial query bounds must be finite"
    );
  }
  if (bounds.minX > bounds.maxX || bounds.minY > bounds.maxY) {
    throw new SpatialQueryError(
      "invalid_viewport",
      "spatial query bounds min must not exceed max"
    );
  }
  if (!Number.isSafeInteger(options.limit) || options.limit < 1) {
    throw new SpatialQueryError(
      "invalid_viewport",
      "spatial query limit must be a positive integer"
    );
  }

  const requiredIds = options.requiredIds ?? [];
  const seen = new Set<number>();
  for (const id of requiredIds) {
    if (!Number.isSafeInteger(id) || id < 1 || seen.has(id)) {
      throw new SpatialQueryError(
        "invalid_viewport",
        "requiredIds must be unique positive integers"
      );
    }
    seen.add(id);
  }

  return {
    bounds: { ...bounds },
    limit: options.limit,
    requiredIds
  };
}

function appendRequiredSpatialIDs(
  candidateIDs: readonly number[],
  requiredIDs: readonly number[]
): number[] {
  const ordered: number[] = [];
  const seen = new Set<number>();
  for (const id of candidateIDs) {
    if (!seen.has(id)) {
      seen.add(id);
      ordered.push(id);
    }
  }
  for (const id of requiredIDs) {
    if (!seen.has(id)) {
      seen.add(id);
      ordered.push(id);
    }
  }
  return ordered;
}

function decodeGeometry(
  kind: DatasetKind,
  blob: Uint8Array | ArrayBuffer | null | undefined
): Geometry {
  if (!blob) {
    throw new SpatialQueryError(
      "corrupt_geometry",
      "spatial payload is missing"
    );
  }
  const bytes = blob instanceof ArrayBuffer ? new Uint8Array(blob) : blob;
  if (kind === "text") {
    return GeoTextCodec.decode(bytes);
  }
  if (kind === "cad") {
    return CadGeometryCodec.read(bytes);
  }
  return GaiaGeometryCodec.decode(bytes);
}

/**
 * 视口空间查询执行器：能力探测 + RTree 候选 + 批量要素加载，
 * 语义与 Go `internal/dataset/spatial_query.go` 对齐。
 */
export class SpatialQuerier {
  constructor(private readonly driver: SqlDriver) {}

  async query(
    info: DatasetInfo,
    options: SpatialQueryOptions
  ): Promise<SpatialQueryResult> {
    const normalized = normalizeSpatialQueryOptions(options);
    const register = await new SmRegisterRepository(this.driver).findSpatialMetadata(
      info.name
    );
    if (!register) {
      throw new UdbxNotFoundError(`dataset ${info.name}`);
    }

    const { capability, detected } = await detectSpatialCapability(
      this.driver,
      info,
      register
    );
    if (!capability.supported) {
      throw new SpatialQueryError(
        "unsupported_dataset_kind",
        `dataset kind '${info.kind}' does not support spatial queries`
      );
    }
    if (!capability.rtreeAvailable && !capability.fallbackAvailable) {
      throw new SpatialQueryError(
        "spatial_index_unavailable",
        "spatial query columns are unavailable"
      );
    }

    if (capability.rtreeAvailable && detected?.rtreeName) {
      return this.queryRTree(info, normalized, detected);
    }

    // Task 4 将实现包络缓存 fallback。
    throw new SpatialQueryError(
      "spatial_index_unavailable",
      "envelope-cache fallback is not implemented yet"
    );
  }

  private async queryRTree(
    info: DatasetInfo,
    options: NormalizedSpatialQueryOptions,
    detected: DetectedSpatialCapability
  ): Promise<SpatialQueryResult> {
    const rtreeName = detected.rtreeName;
    if (!rtreeName) {
      throw new SpatialQueryError(
        "spatial_index_unavailable",
        "RTree name is missing"
      );
    }

    const sql =
      `SELECT d.${quoteIdentifier(detected.idColumn)} AS id` +
      ` FROM ${quoteIdentifier(rtreeName)} AS r` +
      ` JOIN ${quoteIdentifier(info.tableName)} AS d` +
      `   ON d."rowid" = r."pkid"` +
      ` WHERE r."xmax" >= ? AND r."xmin" <= ?` +
      `   AND r."ymax" >= ? AND r."ymin" <= ?` +
      ` ORDER BY d.${quoteIdentifier(detected.idColumn)}` +
      ` LIMIT ?`;
    const rows = await queryAll<{ id: number | bigint }>(
      this.driver,
      sql,
      [
        options.bounds.minX,
        options.bounds.maxX,
        options.bounds.minY,
        options.bounds.maxY,
        options.limit + 1
      ]
    );

    const ids = rows.map((row) => Number(row.id));
    const hasMore = ids.length > options.limit;
    const candidateIDs = hasMore ? ids.slice(0, options.limit) : ids;
    const orderedIDs = appendRequiredSpatialIDs(
      candidateIDs,
      options.requiredIds
    );
    const features = await this.loadFeaturesByIDs(info, detected, orderedIDs);

    return {
      features,
      queriedBounds: options.bounds,
      strategy: "rtree",
      hasMore
    };
  }

  private async loadFeaturesByIDs(
    info: DatasetInfo,
    detected: DetectedSpatialCapability,
    ids: readonly number[]
  ): Promise<readonly Feature[]> {
    if (ids.length === 0) {
      return [];
    }
    const placeholders = ids.map(() => "?").join(", ");
    const rows = await queryAll<Record<string, unknown>>(
      this.driver,
      `SELECT * FROM ${quoteIdentifier(info.tableName)}
       WHERE ${quoteIdentifier(detected.idColumn)} IN (${placeholders})`,
      [...ids]
    );

    const featuresByID = new Map<number, Feature>();
    for (const row of rows) {
      const id = Number(row[detected.idColumn]);
      featuresByID.set(id, this.mapFeature(info, detected, row, id));
    }

    const features: Feature[] = [];
    for (const id of ids) {
      const feature = featuresByID.get(id);
      if (feature) {
        features.push(feature);
      }
    }
    return features;
  }

  private mapFeature(
    info: DatasetInfo,
    detected: DetectedSpatialCapability,
    row: Record<string, unknown>,
    id: number
  ): Feature {
    const geometry = decodeGeometry(
      info.kind,
      row[detected.payloadColumn] as Uint8Array | ArrayBuffer | null | undefined
    );

    const excluded = new Set<string>([
      detected.idColumn,
      detected.payloadColumn
    ]);
    if (info.kind === "text") {
      excluded.add(detected.envelopeColumn);
      excluded.add("SmUserID");
    } else if (info.kind === "cad") {
      excluded.add("SmUserID");
    }

    const attributes: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      if (!excluded.has(key) && !excluded.has(key.toLowerCase())) {
        attributes[key] = value;
      }
    }

    return { id, geometry, attributes };
  }
}

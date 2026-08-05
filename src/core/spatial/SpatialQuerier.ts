import { SpatialQueryError, UdbxNotFoundError } from "../errors";
import { CadGeometryCodec } from "../geometry/cad/CadGeometryCodec";
import {
  GAIA_ENVELOPE_HEADER_LENGTH,
  readGaiaEnvelope
} from "../geometry/gaia/GaiaEnvelope";
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
import {
  EnvelopeCacheManager,
  type EnvelopeEntry
} from "./envelopeCache";

export interface NormalizedSpatialQueryOptions {
  readonly bounds: BoundingBox;
  readonly limit: number;
  readonly requiredIds: readonly number[];
  readonly signal: AbortSignal | undefined;
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
    requiredIds,
    signal: options.signal
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
  try {
    if (kind === "text") {
      return GeoTextCodec.decode(bytes);
    }
    if (kind === "cad") {
      return CadGeometryCodec.read(bytes);
    }
    return GaiaGeometryCodec.decode(bytes);
  } catch {
    throw new SpatialQueryError(
      "corrupt_geometry",
      "failed to decode spatial geometry"
    );
  }
}

/**
 * 视口空间查询执行器：能力探测 + RTree 候选 + 批量要素加载，
 * 语义与 Go `internal/dataset/spatial_query.go` 对齐。
 */
export class SpatialQuerier {
  private readonly envelopeCacheManager: EnvelopeCacheManager;

  constructor(
    private readonly driver: SqlDriver,
    options?: { readonly envelopeCacheManager?: EnvelopeCacheManager }
  ) {
    this.envelopeCacheManager =
      options?.envelopeCacheManager ?? new EnvelopeCacheManager();
  }

  async query(
    info: DatasetInfo,
    options: SpatialQueryOptions
  ): Promise<SpatialQueryResult> {
    const normalized = normalizeSpatialQueryOptions(options);
    this.throwIfAborted(normalized.signal);
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

    if (!detected) {
      throw new SpatialQueryError(
        "spatial_index_unavailable",
        "spatial query columns are unavailable"
      );
    }
    if (capability.rtreeAvailable && detected.rtreeName) {
      return this.queryRTree(info, normalized, detected);
    }

    return this.queryEnvelopeCache(info, normalized, detected);
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
    this.throwIfAborted(options.signal);

    const ids = rows.map((row) => Number(row.id));
    const hasMore = ids.length > options.limit;
    const candidateIDs = hasMore ? ids.slice(0, options.limit) : ids;
    const orderedIDs = appendRequiredSpatialIDs(
      candidateIDs,
      options.requiredIds
    );
    const features = await this.loadFeaturesByIDs(
      info,
      detected,
      orderedIDs,
      options.signal
    );

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
    ids: readonly number[],
    signal?: AbortSignal
  ): Promise<readonly Feature[]> {
    if (ids.length === 0) {
      return [];
    }
    this.throwIfAborted(signal);
    const placeholders = ids.map(() => "?").join(", ");
    const rows = await queryAll<Record<string, unknown>>(
      this.driver,
      `SELECT * FROM ${quoteIdentifier(info.tableName)}
       WHERE ${quoteIdentifier(detected.idColumn)} IN (${placeholders})`,
      [...ids]
    );
    this.throwIfAborted(signal);

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

  private async queryEnvelopeCache(
    info: DatasetInfo,
    options: NormalizedSpatialQueryOptions,
    detected: DetectedSpatialCapability
  ): Promise<SpatialQueryResult> {
    const key = this.envelopeCacheManager.cacheKey(
      info.tableName,
      detected.idColumn,
      detected.envelopeColumn
    );
    this.throwIfAborted(options.signal);
    const entries = await this.envelopeCacheManager.getOrBuild(
      key,
      () => this.buildEnvelopeEntries(info, detected, options.signal),
      options.signal
    );

    const ids: number[] = [];
    let hasMore = false;
    for (const entry of entries) {
      if (
        entry.maxX < options.bounds.minX ||
        entry.minX > options.bounds.maxX ||
        entry.maxY < options.bounds.minY ||
        entry.minY > options.bounds.maxY
      ) {
        continue;
      }
      ids.push(entry.id);
      if (ids.length === options.limit + 1) {
        hasMore = true;
        ids.pop();
        break;
      }
    }

    const orderedIDs = appendRequiredSpatialIDs(ids, options.requiredIds);
    this.throwIfAborted(options.signal);
    const features = await this.loadFeaturesByIDs(
      info,
      detected,
      orderedIDs,
      options.signal
    );
    return {
      features,
      queriedBounds: options.bounds,
      strategy: "envelope_cache",
      hasMore
    };
  }

  private throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
      throw new SpatialQueryError(
        "query_timeout",
        "spatial query cancelled"
      );
    }
  }

  private async *buildEnvelopeEntries(
    info: DatasetInfo,
    detected: DetectedSpatialCapability,
    signal?: AbortSignal
  ): AsyncGenerator<EnvelopeEntry> {
    const nullablePayload =
      info.kind === "text" || info.kind === "cad";
    const statement = await this.driver.prepare(
      `SELECT
         ${quoteIdentifier(detected.idColumn)} AS id,
         substr(${quoteIdentifier(detected.envelopeColumn)}, 1, ${GAIA_ENVELOPE_HEADER_LENGTH}) AS envelope,
         CASE WHEN ${quoteIdentifier(detected.payloadColumn)} IS NOT NULL THEN 1 ELSE 0 END AS payloadPresent
       FROM ${quoteIdentifier(info.tableName)}
       ORDER BY ${quoteIdentifier(detected.idColumn)}`
    );

    try {
      while (await statement.step()) {
        if (signal?.aborted) {
          throw new SpatialQueryError(
            "query_timeout",
            "spatial query cancelled"
          );
        }
        const row = await statement.getRow<{
          id: number | bigint;
          envelope: Uint8Array | ArrayBuffer | null;
          payloadPresent: number;
        }>();
        const id = Number(row.id);
        const envelopeBlob = row.envelope;

        if (envelopeBlob === null || envelopeBlob === undefined) {
          if (nullablePayload && row.payloadPresent === 0) {
            continue; // 双空行：跳过
          }
          if (nullablePayload) {
            throw new SpatialQueryError(
              "spatial_index_unavailable",
              "spatial payload is missing its SmIndexKey envelope"
            );
          }
          throw new SpatialQueryError(
            "corrupt_geometry",
            "GAIA envelope header is not a BLOB"
          );
        }
        if (nullablePayload && row.payloadPresent === 0) {
          throw new SpatialQueryError(
            "corrupt_geometry",
            "SmIndexKey envelope exists without a spatial payload"
          );
        }

        let envelope: ReturnType<typeof readGaiaEnvelope>;
        try {
          const bytes =
            envelopeBlob instanceof ArrayBuffer
              ? new Uint8Array(envelopeBlob)
              : envelopeBlob;
          envelope = readGaiaEnvelope(bytes);
        } catch {
          throw new SpatialQueryError(
            "corrupt_geometry",
            "failed to read GAIA envelope"
          );
        }
        yield {
          id,
          minX: envelope.minX,
          minY: envelope.minY,
          maxX: envelope.maxX,
          maxY: envelope.maxY
        };
      }
    } finally {
      await statement.finalize();
    }
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

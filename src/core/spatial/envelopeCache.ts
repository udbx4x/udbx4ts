import { SpatialQueryError } from "../errors";

export interface EnvelopeEntry {
  readonly id: number;
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface EnvelopeCachePolicy {
  /** 单数据集缓存预算（字节）。 */
  readonly datasetBytes: number;
  /** 当前 DataSource 合计预算（字节）。 */
  readonly sourceBytes: number;
  /** 固定 RSS 计价（字节），对应 4 MiB 固定开销。 */
  readonly fixedRSSChargeBytes: number;
  /** 每个容量条目计价（字节），对应经验值 80 字节/条。 */
  readonly rssChargePerCapacityEntry: number;
}

/** 默认资源策略与 Go `DefaultSpatialQueryPolicy` 对齐（32 MiB/数据集、64 MiB/DataSource）。 */
export const DEFAULT_ENVELOPE_CACHE_POLICY: EnvelopeCachePolicy = {
  datasetBytes: 32 * 1024 * 1024,
  sourceBytes: 64 * 1024 * 1024,
  fixedRSSChargeBytes: 4 * 1024 * 1024,
  rssChargePerCapacityEntry: 80
};

class DatasetEnvelopeCache {
  entries: EnvelopeEntry[] = [];
  bytes = 0;
  complete = false;
  retired = false;
}

/**
 * DataSource 生命周期的包络缓存管理器。
 * 语义与 Go `internal/dataset/envelope_cache.go` 对齐：预算超限以
 * `envelope_cache_budget_exceeded` 失败，写操作经 `invalidate` 失效。
 */
export class EnvelopeCacheManager {
  private readonly caches = new Map<string, DatasetEnvelopeCache>();
  private totalBytes = 0;
  private closed = false;

  constructor(
    private readonly policy: EnvelopeCachePolicy = DEFAULT_ENVELOPE_CACHE_POLICY
  ) {}

  cacheKey(tableName: string, idColumn: string, envelopeColumn: string): string {
    return `${tableName}\u0000${idColumn}\u0000${envelopeColumn}`;
  }

  async getOrBuild(
    key: string,
    build: () => AsyncIterable<EnvelopeEntry>,
    signal?: AbortSignal
  ): Promise<readonly EnvelopeEntry[]> {
    this.assertOpen();
    const existing = this.caches.get(key);
    if (existing && existing.complete && !existing.retired) {
      return existing.entries;
    }

    const cache = new DatasetEnvelopeCache();
    cache.bytes = this.policy.fixedRSSChargeBytes;
    this.totalBytes += cache.bytes;

    try {
      for await (const entry of build()) {
        if (signal?.aborted) {
          throw new SpatialQueryError(
            "query_timeout",
            "spatial query cancelled"
          );
        }
        const charge =
          this.policy.fixedRSSChargeBytes +
          this.policy.rssChargePerCapacityEntry * (cache.entries.length + 1);
        if (
          charge > this.policy.datasetBytes ||
          this.totalBytes - cache.bytes + charge > this.policy.sourceBytes
        ) {
          throw new SpatialQueryError(
            "envelope_cache_budget_exceeded",
            "envelope cache budget exceeded"
          );
        }
        this.totalBytes += this.policy.rssChargePerCapacityEntry;
        cache.bytes += this.policy.rssChargePerCapacityEntry;
        cache.entries.push(entry);
      }
      cache.complete = true;
      this.caches.set(key, cache);
      return cache.entries;
    } catch (error) {
      this.totalBytes -= cache.bytes;
      this.caches.delete(key);
      throw error;
    }
  }

  invalidate(key: string): void {
    const cache = this.caches.get(key);
    if (!cache || cache.retired) {
      return;
    }
    cache.retired = true;
    this.totalBytes -= cache.bytes;
    this.caches.delete(key);
  }

  /** 使指定物理表的所有包络缓存失效。 */
  invalidateTable(tableName: string): void {
    const prefix = `${tableName}\u0000`;
    for (const [key, cache] of this.caches) {
      if (key.startsWith(prefix)) {
        cache.retired = true;
        this.totalBytes -= cache.bytes;
        this.caches.delete(key);
      }
    }
  }

  close(): void {
    this.caches.clear();
    this.totalBytes = 0;
    this.closed = true;
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new SpatialQueryError(
        "envelope_cache_budget_exceeded",
        "envelope cache manager is closed"
      );
    }
  }
}

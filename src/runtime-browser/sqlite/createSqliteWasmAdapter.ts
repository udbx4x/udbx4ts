import type { SqlOpenTarget } from "../../core/sql/SqlDriver";
import type {
  BrowserSqlBindable,
  BrowserSqliteAdapter,
  BrowserSqliteConnectionAdapter,
  BrowserSqliteStatementAdapter
} from "./BrowserSqliteDriver";

type SQLiteBindable = BrowserSqlBindable | boolean | undefined;

interface SQLiteWasmStatementLike {
  bind(binding: readonly SQLiteBindable[]): SQLiteWasmStatementLike;
  step(): boolean;
  get<T = unknown>(target: T): T;
  reset(alsoClearBinds?: boolean): SQLiteWasmStatementLike;
  finalize(): number | undefined;
}

interface SQLiteWasmDatabaseLike {
  exec(sql: string): unknown;
  prepare(sql: string): SQLiteWasmStatementLike;
  close(): void;
}

interface SQLiteWasmOo1Like {
  DB: new (filename?: string, flags?: string, vfs?: string) => SQLiteWasmDatabaseLike;
  OpfsDb?: (new (filename: string, flags?: string) => SQLiteWasmDatabaseLike) & {
    importDb(
      filename: string,
      data:
        | Uint8Array
        | ArrayBuffer
        | (() => Uint8Array | ArrayBuffer | undefined)
        | (() => Promise<Uint8Array | ArrayBuffer | undefined>)
    ): Promise<number>;
  };
}

interface SQLiteWasmLike {
  oo1: SQLiteWasmOo1Like;
  capi: {
    sqlite3_js_db_export(
      db: SQLiteWasmDatabaseLike,
      schema?: string
    ): Uint8Array;
  };
}

export interface SqliteWasmAdapterOptions {
  readonly initSqlite3?: () => Promise<SQLiteWasmLike>;
}

async function defaultInitSqlite3(): Promise<SQLiteWasmLike> {
  const module = await import("@sqlite.org/sqlite-wasm");
  return module.default() as Promise<SQLiteWasmLike>;
}

function ensureOpfsSupported(sqlite3: SQLiteWasmLike): asserts sqlite3 is SQLiteWasmLike & {
  oo1: SQLiteWasmOo1Like & {
    OpfsDb: new (filename: string, flags?: string) => SQLiteWasmDatabaseLike;
  };
} {
  if (typeof sqlite3.oo1.OpfsDb !== "function") {
    throw new Error("OPFS VFS is unavailable in current browser runtime.");
  }
}

function toFilename(target: SqlOpenTarget): { filename: string; flags: string; vfs?: string } {
  switch (target.kind) {
    case "memory":
      return { filename: ":memory:", flags: "c" };
    case "file":
      return { filename: target.path, flags: "c" };
    case "opfs":
      return { filename: target.path, flags: "c", vfs: "opfs" };
    case "buffer":
      throw new Error("Buffer open target is not supported by sqlite-wasm adapter yet.");
  }
}

class SqliteWasmStatementAdapter implements BrowserSqliteStatementAdapter {
  constructor(private readonly statement: SQLiteWasmStatementLike) {}

  bind(params: readonly BrowserSqlBindable[]): void {
    this.statement.bind(params);
  }

  step(): boolean {
    return this.statement.step();
  }

  getRow<T = Record<string, unknown>>(): T {
    return this.statement.get({}) as T;
  }

  reset(): void {
    this.statement.reset();
  }

  finalize(): void {
    this.statement.finalize();
  }
}

class SqliteWasmConnectionAdapter implements BrowserSqliteConnectionAdapter {
  constructor(
    private readonly sqlite3: SQLiteWasmLike,
    private readonly db: SQLiteWasmDatabaseLike
  ) {}

  exec(sql: string): void {
    this.db.exec(sql);
  }

  prepare(sql: string): BrowserSqliteStatementAdapter {
    return new SqliteWasmStatementAdapter(this.db.prepare(sql));
  }

  close(): void {
    this.db.close();
  }

  exportDatabase(): Uint8Array {
    return this.sqlite3.capi.sqlite3_js_db_export(this.db, "main");
  }
}

export function createSqliteWasmAdapter(
  options: SqliteWasmAdapterOptions = {}
): BrowserSqliteAdapter {
  const initSqlite3 = options.initSqlite3 ?? defaultInitSqlite3;
  let sqlite3Promise: Promise<SQLiteWasmLike> | null = null;

  const getSqlite3 = async (): Promise<SQLiteWasmLike> => {
    sqlite3Promise ??= initSqlite3();
    return sqlite3Promise;
  };

  return {
    importDatabase: async (target: SqlOpenTarget, binary: Uint8Array): Promise<void> => {
      if (target.kind !== "opfs") {
        throw new Error(
          "sqlite-wasm adapter currently supports import only for OPFS targets."
        );
      }

      const sqlite3 = await getSqlite3();
      ensureOpfsSupported(sqlite3);
      await sqlite3.oo1.OpfsDb.importDb(target.path, binary);
    },
    open: async (target: SqlOpenTarget): Promise<BrowserSqliteConnectionAdapter> => {
      const sqlite3 = await getSqlite3();
      const { filename, flags, vfs } = toFilename(target);

      if (target.kind === "opfs") {
        ensureOpfsSupported(sqlite3);
        return new SqliteWasmConnectionAdapter(
          sqlite3,
          new sqlite3.oo1.OpfsDb(filename, flags)
        );
      }

      return new SqliteWasmConnectionAdapter(
        sqlite3,
        new sqlite3.oo1.DB(filename, flags, vfs)
      );
    }
  };
}

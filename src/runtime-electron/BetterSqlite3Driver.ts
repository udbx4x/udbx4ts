import type { SqlDriver, SqlOpenTarget, SqlStatement, SqlValue } from "../core/sql/SqlDriver";

type BetterSqlite3 = import("better-sqlite3").Database;
type BetterSqlite3Statement = import("better-sqlite3").Statement;

type BetterSqlite3Bindable = null | string | number | bigint | Buffer | Uint8Array;

function normalizeSqlValues(params?: readonly SqlValue[]): BetterSqlite3Bindable[] {
  if (!params) {
    return [];
  }

  return params.map((value) => {
    if (value instanceof ArrayBuffer) {
      return Buffer.from(value);
    }
    return value as BetterSqlite3Bindable;
  });
}

class BetterSqlite3StatementWrapper implements SqlStatement {
  private iterator: Iterator<Record<string, unknown>, undefined> | null = null;
  private currentRow: Record<string, unknown> | null = null;
  private pendingParams: readonly SqlValue[] | undefined;

  constructor(private readonly stmt: BetterSqlite3Statement) {}

  async bind(params?: readonly SqlValue[]): Promise<void> {
    this.pendingParams = params;
    this.iterator = null;
    this.currentRow = null;
  }

  async step(): Promise<boolean> {
    if (!this.iterator) {
      this.iterator = this.stmt.iterate(
        ...normalizeSqlValues(this.pendingParams)
      ) as Iterator<Record<string, unknown>, undefined>;
    }

    const next = this.iterator.next();
    if (next.done) {
      this.currentRow = null;
      return false;
    }

    this.currentRow = next.value;
    return true;
  }

  async getRow<T = Record<string, unknown>>(): Promise<T> {
    if (!this.currentRow) {
      throw new Error("No current row is available. Call step() first.");
    }

    return this.currentRow as T;
  }

  async reset(): Promise<void> {
    this.iterator = null;
    this.currentRow = null;
    this.pendingParams = undefined;
  }

  async finalize(): Promise<void> {
    this.iterator = null;
    this.currentRow = null;
    this.pendingParams = undefined;
  }
}

export class BetterSqlite3Driver implements SqlDriver {
  private db: BetterSqlite3 | null = null;
  private transactionDepth = 0;

  async open(target: SqlOpenTarget): Promise<void> {
    if (this.db) {
      throw new Error("Database is already open.");
    }

    let Database: typeof import("better-sqlite3").default;
    try {
      Database = (await import("better-sqlite3")).default;
    } catch {
      throw new Error(
        "better-sqlite3 is not available. Install it with: npm install better-sqlite3"
      );
    }

    switch (target.kind) {
      case "file":
        this.db = new Database(target.path);
        break;
      case "memory":
        this.db = new Database(":memory:");
        break;
      case "buffer":
        throw new Error("BetterSqlite3Driver does not support buffer open targets.");
      case "opfs":
        throw new Error("BetterSqlite3Driver does not support OPFS open targets.");
    }

    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.transactionDepth = 0;
    }
  }

  async exec(sql: string): Promise<void> {
    this.requireDb().exec(sql);
  }

  async prepare(sql: string): Promise<SqlStatement> {
    return new BetterSqlite3StatementWrapper(this.requireDb().prepare(sql));
  }

  async transaction<T>(operation: () => Promise<T>): Promise<T> {
    const db = this.requireDb();
    const nested = this.transactionDepth > 0;
    const savepointName = `udbx_sp_${this.transactionDepth}`;

    if (nested) {
      db.exec(`SAVEPOINT ${savepointName}`);
    } else {
      db.exec("BEGIN");
    }
    this.transactionDepth++;

    try {
      const result = await operation();
      this.transactionDepth--;
      if (nested) {
        db.exec(`RELEASE SAVEPOINT ${savepointName}`);
      } else {
        db.exec("COMMIT");
      }
      return result;
    } catch (error) {
      this.transactionDepth--;
      if (nested) {
        db.exec(`ROLLBACK TO SAVEPOINT ${savepointName}`);
        db.exec(`RELEASE SAVEPOINT ${savepointName}`);
      } else {
        db.exec("ROLLBACK");
      }
      throw error;
    }
  }

  private requireDb(): BetterSqlite3 {
    if (!this.db) {
      throw new Error("Database is not open.");
    }

    return this.db;
  }
}

import type {
  SqlDriver,
  SqlOpenTarget,
  SqlStatement,
  SqlValue
} from "../../core/sql/SqlDriver";

export type BrowserSqlBindable = null | string | number | bigint | Uint8Array;

function normalizeSqlValues(params?: readonly SqlValue[]): BrowserSqlBindable[] {
  if (!params) {
    return [];
  }

  return params.map((value) => {
    if (value instanceof ArrayBuffer) {
      return new Uint8Array(value);
    }
    return value as BrowserSqlBindable;
  });
}

export interface BrowserSqliteStatementAdapter {
  bind(params: readonly BrowserSqlBindable[]): Promise<void> | void;
  step(): Promise<boolean> | boolean;
  getRow<T = Record<string, unknown>>(): Promise<T> | T;
  reset(): Promise<void> | void;
  finalize(): Promise<void> | void;
}

export interface BrowserSqliteConnectionAdapter {
  exec(sql: string): Promise<void> | void;
  prepare(sql: string): Promise<BrowserSqliteStatementAdapter> | BrowserSqliteStatementAdapter;
  close(): Promise<void> | void;
  exportDatabase?(): Promise<Uint8Array> | Uint8Array;
}

export interface BrowserSqliteAdapter {
  open(target: SqlOpenTarget): Promise<BrowserSqliteConnectionAdapter>;
  importDatabase?(target: SqlOpenTarget, binary: Uint8Array): Promise<void> | void;
}

class BrowserSqliteStatement implements SqlStatement {
  private boundParams: readonly SqlValue[] | undefined;

  constructor(private readonly adapter: BrowserSqliteStatementAdapter) {}

  async bind(params?: readonly SqlValue[]): Promise<void> {
    this.boundParams = params;
    await this.adapter.bind(normalizeSqlValues(params));
  }

  async step(): Promise<boolean> {
    return this.adapter.step();
  }

  async getRow<T = Record<string, unknown>>(): Promise<T> {
    return this.adapter.getRow<T>();
  }

  async reset(): Promise<void> {
    await this.adapter.reset();
    this.boundParams = undefined;
  }

  async finalize(): Promise<void> {
    await this.adapter.finalize();
    this.boundParams = undefined;
  }
}

export class BrowserSqliteDriver implements SqlDriver {
  private connection: BrowserSqliteConnectionAdapter | null = null;
  private transactionDepth = 0;

  constructor(private readonly adapter: BrowserSqliteAdapter) {}

  async open(target: SqlOpenTarget): Promise<void> {
    if (this.connection) {
      throw new Error("Database is already open.");
    }

    this.connection = await this.adapter.open(target);
  }

  async close(): Promise<void> {
    if (!this.connection) {
      return;
    }

    await this.connection.close();
    this.connection = null;
    this.transactionDepth = 0;
  }

  async exec(sql: string): Promise<void> {
    await this.assertOpen().exec(sql);
  }

  async prepare(sql: string): Promise<SqlStatement> {
    const statement = await this.assertOpen().prepare(sql);
    return new BrowserSqliteStatement(statement);
  }

  async transaction<T>(operation: () => Promise<T>): Promise<T> {
    const nested = this.transactionDepth > 0;
    const savepointName = `udbx_sp_${this.transactionDepth}`;

    if (nested) {
      await this.exec(`SAVEPOINT ${savepointName}`);
    } else {
      await this.exec("BEGIN");
    }

    this.transactionDepth += 1;

    try {
      const result = await operation();
      this.transactionDepth -= 1;

      if (nested) {
        await this.exec(`RELEASE SAVEPOINT ${savepointName}`);
      } else {
        await this.exec("COMMIT");
      }

      return result;
    } catch (error) {
      this.transactionDepth -= 1;

      if (nested) {
        await this.exec(`ROLLBACK TO SAVEPOINT ${savepointName}`);
        await this.exec(`RELEASE SAVEPOINT ${savepointName}`);
      } else {
        await this.exec("ROLLBACK");
      }

      throw error;
    }
  }

  async exportDatabase(): Promise<Uint8Array> {
    const connection = this.assertOpen();
    if (typeof connection.exportDatabase !== "function") {
      throw new Error("Database export is not supported by current browser driver.");
    }

    return connection.exportDatabase();
  }

  async importDatabase(target: SqlOpenTarget, binary: Uint8Array): Promise<void> {
    if (typeof this.adapter.importDatabase !== "function") {
      throw new Error("Database import is not supported by current browser driver.");
    }

    await this.adapter.importDatabase(target, binary);
  }

  private assertOpen(): BrowserSqliteConnectionAdapter {
    if (!this.connection) {
      throw new Error("Database is not open.");
    }

    return this.connection;
  }
}

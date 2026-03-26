import { DatabaseSync, type StatementSync } from "node:sqlite";

import type {
  SqlDriver,
  SqlOpenTarget,
  SqlStatement,
  SqlValue
} from "../../src/core/sql/SqlDriver";

type NodeSqliteBindable = null | string | number | bigint | Uint8Array;

function normalizeSqlValues(params?: readonly SqlValue[]): NodeSqliteBindable[] {
  if (!params) {
    return [];
  }

  return params.map((value) => {
    if (value instanceof ArrayBuffer) {
      return new Uint8Array(value);
    }
    return value as NodeSqliteBindable;
  });
}

class NodeSqliteStatement implements SqlStatement {
  private readonly queryMode: boolean;
  private boundParams: readonly SqlValue[] | undefined;
  private iterator: Iterator<Record<string, unknown>, undefined> | null = null;
  private currentRow: Record<string, unknown> | null = null;
  private executed = false;

  constructor(private readonly statement: StatementSync) {
    this.queryMode = this.statement.columns().length > 0;
  }

  async bind(params?: readonly SqlValue[]): Promise<void> {
    this.boundParams = params;
    this.iterator = null;
    this.currentRow = null;
    this.executed = false;
  }

  async step(): Promise<boolean> {
    if (!this.queryMode) {
      if (!this.executed) {
        this.statement.run(...normalizeSqlValues(this.boundParams));
        this.executed = true;
      }
      return false;
    }

    if (!this.iterator) {
      this.iterator = this.statement.iterate(
        ...normalizeSqlValues(this.boundParams)
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
    this.executed = false;
  }

  async finalize(): Promise<void> {
    this.iterator = null;
    this.currentRow = null;
    this.boundParams = undefined;
  }
}

export class NodeSqliteDriver implements SqlDriver {
  private db: DatabaseSync | null = null;
  private transactionDepth = 0;

  async open(target: SqlOpenTarget): Promise<void> {
    if (this.db) {
      throw new Error("Database is already open.");
    }

    switch (target.kind) {
      case "file":
        this.db = new DatabaseSync(target.path);
        break;
      case "memory":
        this.db = new DatabaseSync(":memory:");
        break;
      case "buffer":
        throw new Error("NodeSqliteDriver does not support buffer open targets.");
      case "opfs":
        throw new Error("NodeSqliteDriver does not support OPFS open targets.");
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.transactionDepth = 0;
    }
  }

  async exec(sql: string): Promise<void> {
    this.assertOpen().exec(sql);
  }

  async prepare(sql: string): Promise<SqlStatement> {
    return new NodeSqliteStatement(this.assertOpen().prepare(sql));
  }

  async transaction<T>(operation: () => Promise<T>): Promise<T> {
    const db = this.assertOpen();
    const nested = this.transactionDepth > 0;
    const savepointName = `udbx_sp_${this.transactionDepth}`;

    if (nested) {
      db.exec(`SAVEPOINT ${savepointName}`);
    } else {
      db.exec("BEGIN");
    }

    this.transactionDepth += 1;

    try {
      const result = await operation();
      this.transactionDepth -= 1;

      if (nested) {
        db.exec(`RELEASE SAVEPOINT ${savepointName}`);
      } else {
        db.exec("COMMIT");
      }

      return result;
    } catch (error) {
      this.transactionDepth -= 1;

      if (nested) {
        db.exec(`ROLLBACK TO SAVEPOINT ${savepointName}`);
        db.exec(`RELEASE SAVEPOINT ${savepointName}`);
      } else {
        db.exec("ROLLBACK");
      }

      throw error;
    }
  }

  private assertOpen(): DatabaseSync {
    if (!this.db) {
      throw new Error("Database is not open.");
    }

    return this.db;
  }
}

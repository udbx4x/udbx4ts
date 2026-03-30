declare module "better-sqlite3" {
  export interface Database {
    prepare(sql: string): Statement;
    exec(sql: string): void;
    pragma(pragma: string): unknown;
    close(): void;
  }

  export interface Statement {
    iterate(...params: unknown[]): IterableIterator<Record<string, unknown>>;
    run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
    get(...params: unknown[]): Record<string, unknown> | undefined;
    all(...params: unknown[]): Record<string, unknown>[];
  }

  interface DatabaseConstructor {
    new (filename: string): Database;
    (filename: string): Database;
  }

  const Database: DatabaseConstructor;
  export default Database;
}

export type SqlValue =
  | null
  | string
  | number
  | bigint
  | Uint8Array
  | ArrayBuffer;

export type SqlOpenTarget =
  | {
      readonly kind: "file";
      readonly path: string;
    }
  | {
      readonly kind: "buffer";
      readonly data: Uint8Array;
    }
  | {
      readonly kind: "opfs";
      readonly path: string;
    }
  | {
      readonly kind: "memory";
      readonly name?: string;
    };

export interface SqlStatement {
  bind(params?: readonly SqlValue[]): Promise<void>;
  step(): Promise<boolean>;
  getRow<T = Record<string, unknown>>(): Promise<T>;
  reset(): Promise<void>;
  finalize(): Promise<void>;
}

export interface SqlDriver {
  open(target: SqlOpenTarget): Promise<void>;
  close(): Promise<void>;
  exec(sql: string): Promise<void>;
  prepare(sql: string): Promise<SqlStatement>;
  transaction<T>(operation: () => Promise<T>): Promise<T>;
}


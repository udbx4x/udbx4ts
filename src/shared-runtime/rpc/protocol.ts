export interface RuntimeRequest<TParams = unknown> {
  readonly id: string;
  readonly method: string;
  readonly params?: TParams;
}

export interface RuntimeSuccess<TResult = unknown> {
  readonly id: string;
  readonly ok: true;
  readonly result: TResult;
}

export interface RuntimeFailure {
  readonly id: string;
  readonly ok: false;
  readonly error: {
    readonly code: string;
    readonly message: string;
  };
}

export type RuntimeResponse<TResult = unknown> =
  | RuntimeSuccess<TResult>
  | RuntimeFailure;


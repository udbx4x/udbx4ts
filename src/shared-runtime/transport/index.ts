export interface RuntimeTransport {
  request<TResult = unknown, TParams = unknown>(
    method: string,
    params?: TParams
  ): Promise<TResult>;
  close(): Promise<void>;
}


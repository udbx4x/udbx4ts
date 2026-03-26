import type {
  RuntimeFailure,
  RuntimeRequest,
  RuntimeResponse,
  RuntimeSuccess
} from "../../shared-runtime/rpc/protocol";
import type { RuntimeTransport } from "../../shared-runtime/transport";

export interface WorkerLike {
  postMessage(message: unknown): void;
  terminate(): void;
  addEventListener(
    type: "message",
    listener: (event: { data: unknown }) => void
  ): void;
  removeEventListener(
    type: "message",
    listener: (event: { data: unknown }) => void
  ): void;
}

interface PendingRequest {
  readonly resolve: (value: unknown) => void;
  readonly reject: (reason?: unknown) => void;
}

function isRuntimeResponse(value: unknown): value is RuntimeResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  return "id" in value && "ok" in value;
}

function toErrorMessage(response: RuntimeFailure): string {
  return `${response.error.code}: ${response.error.message}`;
}

export class BrowserWorkerTransport implements RuntimeTransport {
  private requestId = 0;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly onMessage = (event: { data: unknown }): void => {
    const response = event.data;
    if (!isRuntimeResponse(response)) {
      return;
    }

    const resolver = this.pending.get(response.id);
    if (!resolver) {
      return;
    }

    this.pending.delete(response.id);

    if (response.ok) {
      resolver.resolve((response as RuntimeSuccess).result);
      return;
    }

    resolver.reject(new Error(toErrorMessage(response as RuntimeFailure)));
  };

  constructor(private readonly worker: WorkerLike) {
    this.worker.addEventListener("message", this.onMessage);
  }

  async request<TResult = unknown, TParams = unknown>(
    method: string,
    params?: TParams
  ): Promise<TResult> {
    const id = `${Date.now()}-${this.requestId++}`;

    const request: RuntimeRequest<TParams> =
      params === undefined
        ? { id, method }
        : { id, method, params };

    const promise = new Promise<TResult>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (value) => resolve(value as TResult),
        reject
      });
    });

    this.worker.postMessage(request);
    return promise;
  }

  async close(): Promise<void> {
    this.worker.removeEventListener("message", this.onMessage);

    for (const [, pending] of this.pending) {
      pending.reject(new Error("Transport closed before response was received."));
    }

    this.pending.clear();
    this.worker.terminate();
  }
}

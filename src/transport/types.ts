import type { AuthKind } from "../auth/providers.js";
import type { RateLimitInfo } from "../errors/errors.js";
import type { RetryOptions } from "../retry/policy.js";

/**
 * Minimal fetch signature the SDK depends on. Pass any compatible
 * implementation (undici, a test double, a proxy-aware wrapper) as `fetch`.
 */
export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

/** Per-call options accepted by every service method. */
export interface RequestOptions {
  /** Cancels the request, including any pending retry delay. */
  signal?: AbortSignal;
  /** Per-attempt timeout in milliseconds. Overrides the client default. */
  timeoutMs?: number;
  /** Overrides the client's retry policy for this call. */
  retry?: RetryOptions;
}

export type QueryValue = string | number | boolean | undefined;

/** A request body that is sent as-is (for example, a place file upload). */
export interface RawBody {
  kind: "raw";
  data: Uint8Array | ArrayBuffer | Blob | string;
  contentType: string;
}

/** Internal description of a single API call, built by service modules. */
export interface HttpRequest {
  method: HttpMethod;
  /** Path starting with `/`, with every dynamic segment already encoded. */
  path: string;
  query?: Record<string, QueryValue>;
  /** JSON-serializable body, or a {@link RawBody}. */
  body?: unknown;
  /**
   * Whether repeating the request cannot cause additional side effects.
   * Defaults to `true` for GET/PUT/DELETE and `false` for POST/PATCH.
   */
  idempotent?: boolean;
  /** Credential kinds the endpoint accepts, from the official OpenAPI description. */
  auth: readonly AuthKind[];
  /** How to read a 2xx body. Default `"json"`. */
  responseType?: "json" | "text";
}

export interface HttpResponse<T = unknown> {
  status: number;
  data: T;
  headers: Headers;
  requestId: string | undefined;
  rateLimit: RateLimitInfo | undefined;
}

export interface RequestEvent {
  method: HttpMethod;
  /** Full URL. Never contains credentials (they travel only in headers). */
  url: string;
  /** Request headers with credential values replaced by `[REDACTED]`. */
  headers: Record<string, string>;
  attempt: number;
}

export interface ResponseEvent {
  method: HttpMethod;
  url: string;
  attempt: number;
  status: number;
  durationMs: number;
  requestId: string | undefined;
  rateLimit: RateLimitInfo | undefined;
}

export interface RetryEvent {
  method: HttpMethod;
  url: string;
  /** The attempt that failed (1-based). */
  attempt: number;
  delayMs: number;
  error: unknown;
}

/**
 * Optional observability hooks. They receive redacted data only, and errors
 * they throw are swallowed so logging can never break a request.
 */
export interface TransportHooks {
  onRequest?: (event: RequestEvent) => void;
  onResponse?: (event: ResponseEvent) => void;
  onRetry?: (event: RetryEvent) => void;
}

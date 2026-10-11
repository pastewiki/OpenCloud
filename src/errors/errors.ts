/**
 * Error hierarchy for the SDK.
 *
 * These classes are SDK abstractions. Roblox does not return errors with these
 * names; the SDK maps HTTP status codes and documented Open Cloud error bodies
 * onto them (see https://create.roblox.com/docs/cloud/reference/errors).
 *
 * ```
 * RobloxOpenCloudError
 * ├── ApiError                 (any non-2xx HTTP response)
 * │   ├── ValidationError      400
 * │   ├── AuthenticationError  401
 * │   ├── PermissionError      403
 * │   ├── NotFoundError        404
 * │   ├── ConflictError        409
 * │   └── RateLimitError       429
 * ├── TimeoutError             request exceeded `timeoutMs`
 * ├── AbortError               caller's AbortSignal fired
 * ├── NetworkError             fetch failed before an HTTP response arrived
 * ├── ResponseValidationError  2xx response did not match the expected shape
 * ├── PaginationError          paging could not continue safely
 * └── ConfigurationError       invalid client configuration or arguments
 * ```
 */

export interface RobloxOpenCloudErrorOptions {
  cause?: unknown;
  retryable?: boolean;
}

/** Base class for every error thrown by this SDK. */
export class RobloxOpenCloudError extends Error {
  override readonly name: string = "RobloxOpenCloudError";
  /** Whether retrying the same request later might succeed. */
  readonly retryable: boolean;

  constructor(message: string, options: RobloxOpenCloudErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.retryable = options.retryable ?? false;
  }
}

/** Rate-limit information parsed from `x-ratelimit-*` response headers. */
export interface RateLimitInfo {
  /** Raw `x-ratelimit-limit` header (may describe several windows). */
  limit?: string;
  /** Parsed `x-ratelimit-remaining`. */
  remaining?: number;
  /** Parsed `x-ratelimit-reset`, in seconds until the quota is fully restored. */
  resetSeconds?: number;
}

export interface ApiErrorInit {
  status: number;
  message: string;
  /**
   * Roblox error code when the body contained one: a string such as
   * `"INVALID_ARGUMENT"` (v2) or a number (gateway errors use `0`).
   */
  code?: string | number;
  /** Optional `details` / `errorDetails` array from the error body. */
  details?: readonly unknown[];
  /** Request identifier, when Roblox supplied one (best-effort; see README). */
  requestId?: string;
  /** Delay before retrying, parsed from the `Retry-After` header when present. */
  retryAfterMs?: number;
  rateLimit?: RateLimitInfo;
  method: string;
  /** Request path without the query string. Never contains credentials. */
  path: string;
  /** Parsed JSON body, or a truncated text body, for diagnostics. */
  body?: unknown;
  retryable?: boolean;
  cause?: unknown;
}

/** A non-2xx HTTP response from Roblox. Subclasses narrow it by status. */
export class ApiError extends RobloxOpenCloudError {
  override readonly name: string = "ApiError";
  readonly status: number;
  readonly code: string | number | undefined;
  readonly details: readonly unknown[] | undefined;
  readonly requestId: string | undefined;
  readonly retryAfterMs: number | undefined;
  readonly rateLimit: RateLimitInfo | undefined;
  readonly method: string;
  readonly path: string;
  readonly body: unknown;

  constructor(init: ApiErrorInit) {
    super(formatApiMessage(init), {
      cause: init.cause,
      retryable: init.retryable ?? false,
    });
    this.status = init.status;
    this.code = init.code;
    this.details = init.details;
    this.requestId = init.requestId;
    this.retryAfterMs = init.retryAfterMs;
    this.rateLimit = init.rateLimit;
    this.method = init.method;
    this.path = init.path;
    this.body = init.body;
  }

  /** A JSON-safe summary for structured logging. Contains no credentials. */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      status: this.status,
      code: this.code,
      requestId: this.requestId,
      retryable: this.retryable,
      retryAfterMs: this.retryAfterMs,
      method: this.method,
      path: this.path,
    };
  }
}

function formatApiMessage(init: ApiErrorInit): string {
  const code = init.code === undefined || init.code === 0 ? "" : ` ${String(init.code)}`;
  return `Roblox Open Cloud ${init.method} ${init.path} failed with HTTP ${init.status}${code}: ${init.message}`;
}

/** HTTP 400. Roblox commonly uses code `INVALID_ARGUMENT`. */
export class ValidationError extends ApiError {
  override readonly name: string = "ValidationError";
}

/** HTTP 401. The API key or token is missing, invalid, or expired. */
export class AuthenticationError extends ApiError {
  override readonly name: string = "AuthenticationError";
}

/**
 * HTTP 403. The credential lacks a required permission or scope, or the key is
 * not allowed to access this resource (for example, the experience restriction
 * or IP allowlist excludes it).
 *
 * Note: some endpoints also return 403 with `"Invalid authentication data
 * provided"` when no credential was sent at all. Check `message` when diagnosing.
 */
export class PermissionError extends ApiError {
  override readonly name: string = "PermissionError";
}

/** HTTP 404. */
export class NotFoundError extends ApiError {
  override readonly name: string = "NotFoundError";
}

/** HTTP 409. Roblox documents code `ABORTED`, usually from a conflict. */
export class ConflictError extends ApiError {
  override readonly name: string = "ConflictError";
}

/** HTTP 429 (`RESOURCE_EXHAUSTED`). Retryable once `retryAfterMs` has elapsed. */
export class RateLimitError extends ApiError {
  override readonly name: string = "RateLimitError";
}

/** The request did not finish within the configured timeout. */
export class TimeoutError extends RobloxOpenCloudError {
  override readonly name: string = "TimeoutError";
  readonly timeoutMs: number;

  constructor(message: string, timeoutMs: number, options: RobloxOpenCloudErrorOptions = {}) {
    super(message, { retryable: true, ...options });
    this.timeoutMs = timeoutMs;
  }
}

/** The caller aborted the request through an `AbortSignal`. Never retried. */
export class AbortError extends RobloxOpenCloudError {
  override readonly name: string = "AbortError";

  constructor(message = "The request was aborted", options: RobloxOpenCloudErrorOptions = {}) {
    super(message, { ...options, retryable: false });
  }
}

/** The request failed before an HTTP response arrived (DNS, TLS, reset). */
export class NetworkError extends RobloxOpenCloudError {
  override readonly name: string = "NetworkError";

  constructor(message: string, options: RobloxOpenCloudErrorOptions = {}) {
    super(message, { retryable: true, ...options });
  }
}

/**
 * A successful response did not have the shape the SDK expected. This usually
 * means the API changed. The raw body is attached for diagnostics.
 */
export class ResponseValidationError extends RobloxOpenCloudError {
  override readonly name: string = "ResponseValidationError";
  readonly body: unknown;

  constructor(message: string, body: unknown) {
    super(message);
    this.body = body;
  }
}

/** Pagination could not continue safely (for example, a repeated page token). */
export class PaginationError extends RobloxOpenCloudError {
  override readonly name: string = "PaginationError";
}

/** Invalid SDK configuration or method arguments, detected before any request. */
export class ConfigurationError extends RobloxOpenCloudError {
  override readonly name: string = "ConfigurationError";
}

import {
  AbortError,
  ApiError,
  ConfigurationError,
  RateLimitError,
  RobloxOpenCloudError,
} from "../errors/errors.js";

/** Hard ceiling on attempts so a misconfiguration cannot loop forever. */
export const MAX_ATTEMPTS_LIMIT = 10;

export interface RetryOptions {
  /**
   * Total attempts including the first request. `1` disables retries.
   * Default 3, maximum {@link MAX_ATTEMPTS_LIMIT}.
   */
  maxAttempts?: number;
  /** Base delay for exponential backoff. Default 500 ms. */
  baseDelayMs?: number;
  /** Upper bound for a single computed backoff delay. Default 20 000 ms. */
  maxDelayMs?: number;
  /**
   * If a `Retry-After` header asks for a longer wait than this, the SDK throws
   * the {@link RateLimitError} instead of sleeping. Default 60 000 ms.
   */
  maxRetryAfterMs?: number;
  /**
   * Whether non-idempotent requests (for example `increment` or
   * `publishMessage`) are retried after HTTP 429.
   *
   * Default `true`: a 429 means Roblox throttled the request, so it is treated
   * as not executed. Roblox does not state this guarantee explicitly; set this
   * to `false` if a duplicate write would be harmful for your use case.
   * Non-idempotent requests are never retried after timeouts, network errors,
   * or 5xx responses, because the server may already have applied them.
   */
  retryNonIdempotentOnRateLimit?: boolean;
  /** Random source in [0, 1) used for jitter. Injectable for tests. */
  random?: () => number;
}

export interface ResolvedRetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  maxRetryAfterMs: number;
  retryNonIdempotentOnRateLimit: boolean;
  random: () => number;
}

export const DEFAULT_RETRY_OPTIONS: ResolvedRetryOptions = {
  maxAttempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 20_000,
  maxRetryAfterMs: 60_000,
  retryNonIdempotentOnRateLimit: true,
  random: Math.random,
};

/** Merges and validates retry options. Throws {@link ConfigurationError}. */
export function resolveRetryOptions(
  options: RetryOptions | undefined,
  base: ResolvedRetryOptions = DEFAULT_RETRY_OPTIONS,
): ResolvedRetryOptions {
  const merged: ResolvedRetryOptions = {
    maxAttempts: options?.maxAttempts ?? base.maxAttempts,
    baseDelayMs: options?.baseDelayMs ?? base.baseDelayMs,
    maxDelayMs: options?.maxDelayMs ?? base.maxDelayMs,
    maxRetryAfterMs: options?.maxRetryAfterMs ?? base.maxRetryAfterMs,
    retryNonIdempotentOnRateLimit:
      options?.retryNonIdempotentOnRateLimit ?? base.retryNonIdempotentOnRateLimit,
    random: options?.random ?? base.random,
  };
  if (
    !Number.isInteger(merged.maxAttempts) ||
    merged.maxAttempts < 1 ||
    merged.maxAttempts > MAX_ATTEMPTS_LIMIT
  ) {
    throw new ConfigurationError(
      `retry.maxAttempts must be an integer between 1 and ${MAX_ATTEMPTS_LIMIT}`,
    );
  }
  for (const key of ["baseDelayMs", "maxDelayMs", "maxRetryAfterMs"] as const) {
    const value = merged[key];
    if (!Number.isFinite(value) || value < 0) {
      throw new ConfigurationError(`retry.${key} must be a non-negative number`);
    }
  }
  return merged;
}

/**
 * Decides whether a failed attempt should be retried.
 *
 * @param attempt 1-based number of the attempt that just failed.
 * @param idempotent whether repeating the request cannot cause extra side effects.
 */
export function shouldRetry(
  error: unknown,
  attempt: number,
  idempotent: boolean,
  options: ResolvedRetryOptions,
): boolean {
  if (attempt >= options.maxAttempts) return false;
  if (!(error instanceof RobloxOpenCloudError) || error instanceof AbortError) return false;
  if (!error.retryable) return false;

  if (error instanceof RateLimitError) {
    if (!idempotent && !options.retryNonIdempotentOnRateLimit) return false;
    if (error.retryAfterMs !== undefined && error.retryAfterMs > options.maxRetryAfterMs) {
      return false;
    }
    return true;
  }
  // 5xx, timeouts, and network errors: the request may have been applied.
  return idempotent;
}

/**
 * Delay before the next attempt. Honors `Retry-After` when Roblox sent one;
 * otherwise uses exponential backoff with full jitter:
 * `random() * min(maxDelayMs, baseDelayMs * 2^(attempt - 1))`.
 */
export function computeRetryDelay(
  error: unknown,
  attempt: number,
  options: ResolvedRetryOptions,
): number {
  if (error instanceof ApiError && error.retryAfterMs !== undefined) {
    return Math.min(error.retryAfterMs, options.maxRetryAfterMs);
  }
  const ceiling = Math.min(options.maxDelayMs, options.baseDelayMs * 2 ** (attempt - 1));
  return Math.floor(options.random() * ceiling);
}

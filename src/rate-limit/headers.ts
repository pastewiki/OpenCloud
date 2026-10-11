import type { RateLimitInfo } from "../errors/errors.js";

/**
 * Parses the rate-limit headers documented at
 * https://create.roblox.com/docs/cloud/reference/rate-limits:
 *
 * - `x-ratelimit-limit`: limit(s) per window, e.g. `1000, 1000;w=60`. Kept raw.
 * - `x-ratelimit-remaining`: requests left for the current credential.
 * - `x-ratelimit-reset`: seconds until the quota is fully restored.
 *
 * Returns `undefined` when none of the headers are present.
 */
export function parseRateLimitHeaders(headers: Headers): RateLimitInfo | undefined {
  const limit = headers.get("x-ratelimit-limit") ?? undefined;
  const remaining = parseNonNegativeNumber(headers.get("x-ratelimit-remaining"));
  const resetSeconds = parseNonNegativeNumber(headers.get("x-ratelimit-reset"));
  if (limit === undefined && remaining === undefined && resetSeconds === undefined) {
    return undefined;
  }
  const info: RateLimitInfo = {};
  if (limit !== undefined) info.limit = limit;
  if (remaining !== undefined) info.remaining = remaining;
  if (resetSeconds !== undefined) info.resetSeconds = resetSeconds;
  return info;
}

/**
 * Parses a `Retry-After` header (delta-seconds or HTTP-date) into milliseconds.
 * Roblox's rate-limit guide says to treat it "as a guideline for when to retry".
 */
export function parseRetryAfter(
  value: string | null,
  now: number = Date.now(),
): number | undefined {
  if (value === null) return undefined;
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return Math.round(Number(trimmed) * 1000);
  }
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, date - now);
}

function parseNonNegativeNumber(value: string | null): number | undefined {
  if (value === null) return undefined;
  const n = Number(value.trim());
  return Number.isFinite(n) && n >= 0 && value.trim() !== "" ? n : undefined;
}

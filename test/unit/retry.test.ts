import { describe, expect, it, vi } from "vitest";
import {
  AbortError,
  ApiError,
  NetworkError,
  RateLimitError,
  TimeoutError,
  parseRetryAfter,
} from "../../src/index.js";
import { computeRetryDelay, resolveRetryOptions, shouldRetry } from "../../src/retry/policy.js";
import { createApiError } from "../../src/errors/parse.js";
import { empty, json, mockFetch, testClient } from "../helpers.js";

const opts = resolveRetryOptions({
  maxAttempts: 4,
  baseDelayMs: 100,
  maxDelayMs: 1000,
  random: () => 0.5,
});
const rateLimited = (retryAfterMs?: number) =>
  createApiError({
    status: 429,
    message: "x",
    method: "GET",
    path: "/",
    ...(retryAfterMs !== undefined && { retryAfterMs }),
  });
const serverError = createApiError({ status: 503, message: "x", method: "GET", path: "/" });
const badRequest = createApiError({ status: 400, message: "x", method: "GET", path: "/" });

describe("retry policy", () => {
  it("retries idempotent requests on transient failures", () => {
    expect(shouldRetry(rateLimited(), 1, true, opts)).toBe(true);
    expect(shouldRetry(serverError, 1, true, opts)).toBe(true);
    expect(shouldRetry(new NetworkError("reset"), 1, true, opts)).toBe(true);
    expect(shouldRetry(new TimeoutError("slow", 10), 1, true, opts)).toBe(true);
  });

  it("never retries permanent errors, aborts, or foreign errors", () => {
    expect(shouldRetry(badRequest, 1, true, opts)).toBe(false);
    expect(shouldRetry(new AbortError(), 1, true, opts)).toBe(false);
    expect(shouldRetry(new Error("bug"), 1, true, opts)).toBe(false);
  });

  it("retries non-idempotent requests only after 429", () => {
    expect(shouldRetry(rateLimited(), 1, false, opts)).toBe(true);
    expect(shouldRetry(serverError, 1, false, opts)).toBe(false);
    expect(shouldRetry(new NetworkError("reset"), 1, false, opts)).toBe(false);
    expect(shouldRetry(new TimeoutError("slow", 10), 1, false, opts)).toBe(false);
    const strict = resolveRetryOptions({ retryNonIdempotentOnRateLimit: false }, opts);
    expect(shouldRetry(rateLimited(), 1, false, strict)).toBe(false);
  });

  it("stops at maxAttempts", () => {
    expect(shouldRetry(serverError, 3, true, opts)).toBe(true);
    expect(shouldRetry(serverError, 4, true, opts)).toBe(false);
  });

  it("gives up when Retry-After exceeds maxRetryAfterMs", () => {
    const capped = resolveRetryOptions({ maxRetryAfterMs: 5000 }, opts);
    expect(shouldRetry(rateLimited(4000), 1, true, capped)).toBe(true);
    expect(shouldRetry(rateLimited(6000), 1, true, capped)).toBe(false);
  });

  it("uses Retry-After when present", () => {
    expect(computeRetryDelay(rateLimited(2500), 1, opts)).toBe(2500);
  });

  it("uses capped exponential backoff with full jitter otherwise", () => {
    expect(computeRetryDelay(serverError, 1, opts)).toBe(50); // 0.5 * 100
    expect(computeRetryDelay(serverError, 2, opts)).toBe(100); // 0.5 * 200
    expect(computeRetryDelay(serverError, 3, opts)).toBe(200); // 0.5 * 400
    expect(computeRetryDelay(serverError, 10, opts)).toBe(500); // 0.5 * cap 1000
    const zero = resolveRetryOptions({ random: () => 0 }, opts);
    expect(computeRetryDelay(serverError, 1, zero)).toBe(0);
  });

  it("parses Retry-After seconds and HTTP dates", () => {
    expect(parseRetryAfter("3")).toBe(3000);
    expect(parseRetryAfter("1.5")).toBe(1500);
    const now = Date.parse("2026-01-01T00:00:00Z");
    expect(parseRetryAfter("Thu, 01 Jan 2026 00:00:10 GMT", now)).toBe(10_000);
    expect(parseRetryAfter("Wed, 31 Dec 2025 00:00:00 GMT", now)).toBe(0);
    expect(parseRetryAfter("soon")).toBeUndefined();
    expect(parseRetryAfter(null)).toBeUndefined();
  });
});

describe("retry behavior end to end", () => {
  it("retries a GET after 429 and 503, then succeeds", async () => {
    const { fetch, calls } = mockFetch(
      json({ code: "RESOURCE_EXHAUSTED", message: "x" }, 429, { "retry-after": "0" }),
      json({ code: "UNAVAILABLE", message: "x" }, 503),
      json({ path: "universes/1" }),
    );
    const onRetry = vi.fn();
    const client = testClient(fetch, { hooks: { onRetry } });
    await expect(client.universes.get({ universeId: 1 })).resolves.toEqual({ path: "universes/1" });
    expect(calls).toHaveLength(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry.mock.calls[0]?.[0]).toMatchObject({ attempt: 1, delayMs: 0 });
  });

  it("throws the last error after maxAttempts", async () => {
    const { fetch, calls } = mockFetch(
      json({ message: "x" }, 503),
      json({ message: "x" }, 503),
      json({ message: "x" }, 503),
    );
    const error = await testClient(fetch)
      .universes.get({ universeId: 1 })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(calls).toHaveLength(3);
  });

  it("does not retry a non-idempotent POST after a 5xx", async () => {
    const { fetch, calls } = mockFetch(json({ message: "x" }, 500));
    await expect(
      testClient(fetch).messaging.publish({ universeId: 1, topic: "t", message: "m" }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(calls).toHaveLength(1);
  });

  it("does not retry a non-idempotent POST after a network error", async () => {
    const { fetch, calls } = mockFetch(new TypeError("fetch failed"));
    await expect(
      testClient(fetch).dataStores.incrementEntry({
        universeId: 1,
        dataStoreId: "s",
        entryId: "k",
        amount: 1,
      }),
    ).rejects.toBeInstanceOf(NetworkError);
    expect(calls).toHaveLength(1);
  });

  it("retries a non-idempotent POST after 429", async () => {
    const { fetch, calls } = mockFetch(json({ message: "x" }, 429), empty(200));
    await testClient(fetch).messaging.publish({ universeId: 1, topic: "t", message: "m" });
    expect(calls).toHaveLength(2);
  });

  it("retries network errors for GET requests", async () => {
    const { fetch, calls } = mockFetch(
      new TypeError("fetch failed"),
      json({ path: "universes/1" }),
    );
    await testClient(fetch).universes.get({ universeId: 1 });
    expect(calls).toHaveLength(2);
  });

  it("allows per-call retry overrides", async () => {
    const { fetch, calls } = mockFetch(json({ message: "x" }, 503));
    await expect(
      testClient(fetch).universes.get({ universeId: 1 }, { retry: { maxAttempts: 1 } }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(calls).toHaveLength(1);
  });

  it("treats updateEntry with an etag as non-idempotent", async () => {
    const { fetch, calls } = mockFetch(json({ message: "x" }, 503));
    await expect(
      testClient(fetch).dataStores.updateEntry({
        universeId: 1,
        dataStoreId: "s",
        entryId: "k",
        value: 1,
        etag: "abc",
      }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(calls).toHaveLength(1);
  });

  it("exposes RateLimitError after exhausting attempts on 429", async () => {
    const { fetch } = mockFetch(json({}, 429), json({}, 429), json({}, 429));
    await expect(testClient(fetch).universes.get({ universeId: 1 })).rejects.toBeInstanceOf(
      RateLimitError,
    );
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ApiError,
  AuthenticationError,
  ConflictError,
  NotFoundError,
  PermissionError,
  RateLimitError,
  ResponseValidationError,
  ValidationError,
  parseErrorBody,
} from "../../src/index.js";
import { TEST_API_KEY, empty, json, mockFetch, testClient } from "../helpers.js";

const noRetry = { retry: { maxAttempts: 1 } };

describe("parseErrorBody", () => {
  it("parses the gateway shape", () => {
    expect(parseErrorBody({ errors: [{ code: 0, message: "Invalid API Key" }] })).toEqual({
      code: 0,
      message: "Invalid API Key",
    });
  });

  it("parses the v2 shape", () => {
    expect(
      parseErrorBody({ code: "INVALID_ARGUMENT", message: "bad", details: [{ a: 1 }] }),
    ).toEqual({ code: "INVALID_ARGUMENT", message: "bad", details: [{ a: 1 }] });
  });

  it("parses the v1 error/errorDetails shape", () => {
    const body = {
      error: "NOT_FOUND",
      message: "Entry not found",
      errorDetails: [{ errorDetailType: "DatastoreErrorInfo", datastoreErrorCode: "KeyNotFound" }],
    };
    expect(parseErrorBody(body)).toEqual({
      code: "NOT_FOUND",
      message: "Entry not found",
      details: body.errorDetails,
    });
  });

  it("parses the v1 validation problem shape including traceId", () => {
    const parsed = parseErrorBody({
      errors: { topic: ["The topic field is required."] },
      type: "https://tools.ietf.org/html/rfc7231#section-6.5.1",
      title: "One or more validation errors occurred.",
      status: 400,
      extensions: { traceId: "00-abc-def-00" },
    });
    expect(parsed.message).toBe(
      "One or more validation errors occurred. (topic: The topic field is required.)",
    );
    expect(parsed.traceId).toBe("00-abc-def-00");
  });

  it("returns nothing for unknown shapes", () => {
    expect(parseErrorBody("oops")).toEqual({});
    expect(parseErrorBody(null)).toEqual({});
    expect(parseErrorBody([1, 2])).toEqual({});
  });
});

const gateway = JSON.parse(
  readFileSync(new URL("../fixtures/gateway-errors.json", import.meta.url), "utf8"),
) as Record<string, { status: number; body: unknown }>;

describe("observed gateway error responses", () => {
  it.each([
    ["invalidApiKey", AuthenticationError, "Invalid API Key"],
    ["missingApiKeyHeader", AuthenticationError, "Missing API Key Header"],
    ["invalidAuthenticationData", PermissionError, "Invalid authentication data provided"],
  ] as const)("maps %s", async (name, ErrorClass, message) => {
    const fixture = gateway[name]!;
    const { fetch } = mockFetch(json(fixture.body, fixture.status));
    const error = (await testClient(fetch)
      .universes.get({ universeId: 1 })
      .catch((e: unknown) => e)) as ApiError;
    expect(error).toBeInstanceOf(ErrorClass);
    expect(error.code).toBe(0);
    expect(error.message).toContain(message);
    expect(error.message).not.toContain(" 0:"); // gateway code 0 is not shown as a code
  });
});

describe("HTTP error mapping", () => {
  it.each([
    [400, ValidationError, false],
    [401, AuthenticationError, false],
    [403, PermissionError, false],
    [404, NotFoundError, false],
    [409, ConflictError, false],
    [429, RateLimitError, true],
    [500, ApiError, true],
    [503, ApiError, true],
    [418, ApiError, false],
  ] as const)("maps HTTP %i to %s", async (status, ErrorClass, retryable) => {
    const { fetch } = mockFetch(json({ code: "X", message: "nope" }, status));
    const client = testClient(fetch, noRetry);
    const error = await client.universes.get({ universeId: 1 }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorClass);
    expect((error as ApiError).constructor).toBe(ErrorClass);
    expect((error as ApiError).status).toBe(status);
    expect((error as ApiError).retryable).toBe(retryable);
  });

  it("does not misclassify unknown 5xx statuses", async () => {
    const { fetch } = mockFetch(json({ code: "INTERNAL", message: "boom" }, 500));
    const error = await testClient(fetch, noRetry)
      .universes.get({ universeId: 1 })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).not.toBeInstanceOf(RateLimitError);
  });

  it("includes diagnostics on the error", async () => {
    const { fetch } = mockFetch(
      json({ code: "RESOURCE_EXHAUSTED", message: "slow down" }, 429, {
        "retry-after": "7",
        "x-ratelimit-limit": "100, 100;w=60",
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": "42",
        "x-request-id": "req-123",
      }),
    );
    const error = (await testClient(fetch, noRetry)
      .universes.get({ universeId: 99 })
      .catch((e: unknown) => e)) as RateLimitError;
    expect(error).toBeInstanceOf(RateLimitError);
    expect(error.code).toBe("RESOURCE_EXHAUSTED");
    expect(error.retryAfterMs).toBe(7000);
    expect(error.rateLimit).toEqual({ limit: "100, 100;w=60", remaining: 0, resetSeconds: 42 });
    expect(error.requestId).toBe("req-123");
    expect(error.method).toBe("GET");
    expect(error.path).toBe("/cloud/v2/universes/99");
    expect(error.message).toContain("HTTP 429 RESOURCE_EXHAUSTED: slow down");
    expect(error.toJSON()).toMatchObject({ status: 429, requestId: "req-123" });
  });

  it("uses traceId from v1 validation bodies as the request ID", async () => {
    const { fetch } = mockFetch(
      json(
        { errors: { x: ["bad"] }, title: "Invalid", status: 400, extensions: { traceId: "t-1" } },
        400,
      ),
    );
    const error = (await testClient(fetch)
      .universes.get({ universeId: 1 })
      .catch((e: unknown) => e)) as ApiError;
    expect(error.requestId).toBe("t-1");
  });

  it("handles empty error bodies", async () => {
    const { fetch } = mockFetch(empty(404));
    const error = (await testClient(fetch)
      .universes.get({ universeId: 1 })
      .catch((e: unknown) => e)) as ApiError;
    expect(error).toBeInstanceOf(NotFoundError);
    expect(error.body).toBe("");
    expect(error.message).toMatch(/HTTP 404/);
  });

  it("handles non-JSON error bodies and truncates them", async () => {
    const html = `<html>${"x".repeat(5000)}</html>`;
    const { fetch } = mockFetch(new Response(html, { status: 502, statusText: "Bad Gateway" }));
    const error = (await testClient(fetch, noRetry)
      .universes.get({ universeId: 1 })
      .catch((e: unknown) => e)) as ApiError;
    expect(error.status).toBe(502);
    expect(error.message).toContain("Bad Gateway");
    expect((error.body as string).length).toBe(2000);
  });

  it("redacts the API key if an error body echoes it", async () => {
    const { fetch } = mockFetch(json({ message: `bad key ${TEST_API_KEY}` }, 401));
    const error = (await testClient(fetch)
      .universes.get({ universeId: 1 })
      .catch((e: unknown) => e)) as ApiError;
    expect(error.message).not.toContain(TEST_API_KEY);
    expect(JSON.stringify(error.body)).not.toContain(TEST_API_KEY);
    expect(error.message).toContain("[REDACTED]");
  });
});

describe("success body handling", () => {
  it("rejects a non-JSON success body", async () => {
    const { fetch } = mockFetch(new Response("<html>ok</html>", { status: 200 }));
    await expect(testClient(fetch).universes.get({ universeId: 1 })).rejects.toBeInstanceOf(
      ResponseValidationError,
    );
  });

  it("rejects a JSON success body of the wrong shape", async () => {
    const { fetch } = mockFetch(json([1, 2, 3]));
    await expect(testClient(fetch).universes.get({ universeId: 1 })).rejects.toThrow(
      /Expected .* to be a JSON object/,
    );
  });

  it("accepts an empty body for void operations", async () => {
    const { fetch } = mockFetch(empty(200));
    await expect(
      testClient(fetch).messaging.publish({ universeId: 1, topic: "t", message: "m" }),
    ).resolves.toBeUndefined();
  });

  it("rejects list responses whose items field is not an array", async () => {
    const { fetch } = mockFetch(json({ dataStores: "nope" }));
    await expect(
      testClient(fetch).dataStores.listDataStores({ universeId: 1 }).getPage(),
    ).rejects.toThrow(/dataStores to be an array/);
  });
});

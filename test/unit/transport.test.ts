import { describe, expect, it, vi } from "vitest";
import { AbortError, NetworkError, TimeoutError } from "../../src/index.js";
import { TEST_API_KEY, json, mockFetch, testClient } from "../helpers.js";

/** A fetch that never resolves until its signal aborts. */
function hangingFetch() {
  const calls: AbortSignal[] = [];
  const fetch = async (_url: string, init: RequestInit): Promise<Response> =>
    new Promise((_resolve, reject) => {
      const signal = init.signal!;
      calls.push(signal);
      signal.addEventListener("abort", () => {
        reject(new DOMException("aborted", "AbortError"));
      });
    });
  return { fetch, calls };
}

describe("transport", () => {
  it("sends the API key only in the x-api-key header", async () => {
    const { fetch, calls } = mockFetch(json({ path: "universes/1" }));
    await testClient(fetch).universes.get({ universeId: 1 });
    const call = calls[0]!;
    expect(call.headers.get("x-api-key")).toBe(TEST_API_KEY);
    expect(call.url).not.toContain(TEST_API_KEY);
    expect(call.headers.get("accept")).toBe("application/json");
  });

  it("serializes JSON bodies with a content type", async () => {
    const { fetch, calls } = mockFetch(json({}));
    await testClient(fetch).messaging.publish({ universeId: 1, topic: "t", message: "hi" });
    expect(calls[0]?.headers.get("content-type")).toBe("application/json");
    expect(calls[0]?.body).toBe(JSON.stringify({ topic: "t", message: "hi" }));
  });

  it("times out a stalled request with TimeoutError", async () => {
    const { fetch, calls } = hangingFetch();
    const client = testClient(fetch, { timeoutMs: 20, retry: { maxAttempts: 1 } });
    const error = await client.universes.get({ universeId: 1 }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TimeoutError);
    expect((error as TimeoutError).timeoutMs).toBe(20);
    expect(calls[0]?.aborted).toBe(true);
  });

  it("retries timeouts for idempotent requests", async () => {
    let n = 0;
    const fetch = async (url: string, init: RequestInit): Promise<Response> => {
      n++;
      return n === 1
        ? hangingFetch().fetch(url, init)
        : Promise.resolve(json({ path: "universes/1" }));
    };
    await testClient(fetch, { timeoutMs: 20 }).universes.get({ universeId: 1 });
    expect(n).toBe(2);
  });

  it("supports a per-call timeout override", async () => {
    const { fetch } = hangingFetch();
    const client = testClient(fetch, { timeoutMs: 60_000, retry: { maxAttempts: 1 } });
    await expect(client.universes.get({ universeId: 1 }, { timeoutMs: 10 })).rejects.toBeInstanceOf(
      TimeoutError,
    );
  });

  it("aborts an in-flight request with AbortError and does not retry", async () => {
    const { fetch, calls } = hangingFetch();
    const controller = new AbortController();
    const promise = testClient(fetch).universes.get(
      { universeId: 1 },
      { signal: controller.signal },
    );
    setTimeout(() => {
      controller.abort();
    }, 5);
    await expect(promise).rejects.toBeInstanceOf(AbortError);
    expect(calls).toHaveLength(1);
  });

  it("rejects immediately if the signal is already aborted", async () => {
    const { fetch, calls } = mockFetch();
    const controller = new AbortController();
    controller.abort();
    await expect(
      testClient(fetch).universes.get({ universeId: 1 }, { signal: controller.signal }),
    ).rejects.toBeInstanceOf(AbortError);
    expect(calls).toHaveLength(0);
  });

  it("aborts during a retry delay", async () => {
    const { fetch, calls } = mockFetch(json({}, 503), json({ path: "universes/1" }));
    const controller = new AbortController();
    const client = testClient(fetch, { retry: { baseDelayMs: 10_000, random: () => 1 } });
    const promise = client.universes.get({ universeId: 1 }, { signal: controller.signal });
    setTimeout(() => {
      controller.abort();
    }, 20);
    await expect(promise).rejects.toBeInstanceOf(AbortError);
    expect(calls).toHaveLength(1);
  });

  it("wraps fetch failures in NetworkError without leaking the key", async () => {
    const { fetch } = mockFetch(new TypeError(`connect failed ${TEST_API_KEY}`));
    const error = await testClient(fetch, { retry: { maxAttempts: 1 } })
      .universes.get({ universeId: 1 })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NetworkError);
    expect((error as Error).message).not.toContain(TEST_API_KEY);
  });

  it("passes only redacted headers to hooks", async () => {
    const onRequest = vi.fn();
    const onResponse = vi.fn();
    const { fetch } = mockFetch(
      json({ path: "universes/1" }, 200, { "x-ratelimit-remaining": "9" }),
    );
    await testClient(fetch, { hooks: { onRequest, onResponse } }).universes.get({ universeId: 1 });
    const request = onRequest.mock.calls[0]?.[0] as { headers: Record<string, string> };
    expect(request.headers["x-api-key"]).toBe("[REDACTED]");
    expect(JSON.stringify(onRequest.mock.calls)).not.toContain(TEST_API_KEY);
    expect(onResponse.mock.calls[0]?.[0]).toMatchObject({
      status: 200,
      rateLimit: { remaining: 9 },
    });
  });

  it("does not let a throwing hook break the request", async () => {
    const warn = vi.spyOn(process, "emitWarning").mockImplementation(() => undefined);
    const { fetch } = mockFetch(json({ path: "universes/1" }));
    const client = testClient(fetch, {
      hooks: {
        onRequest: () => {
          throw new Error("logger down");
        },
      },
    });
    await expect(client.universes.get({ universeId: 1 })).resolves.toEqual({ path: "universes/1" });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("logger down"), expect.anything());
    warn.mockRestore();
  });

  it("encodes path segments so IDs cannot alter the route", async () => {
    const { fetch, calls } = mockFetch(json({ path: "x", id: "x" }));
    await testClient(fetch).dataStores.getEntry({
      universeId: 1,
      dataStoreId: "a/b?c",
      entryId: "k#1",
    });
    expect(calls[0]?.url).toBe(
      "https://apis.roblox.com/cloud/v2/universes/1/data-stores/a%2Fb%3Fc/entries/k%231",
    );
  });
});

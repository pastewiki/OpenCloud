import { RobloxOpenCloud, type RobloxOpenCloudConfig } from "../src/index.js";

/** A fake key long enough to exercise redaction. Not a real credential. */
export const TEST_API_KEY = "test-key-0123456789abcdefghijklmnopqrstuvwxyz";

export interface RecordedCall {
  url: string;
  method: string;
  headers: Headers;
  body: unknown;
  signal: AbortSignal | null | undefined;
}

type Responder = Response | Error | ((call: RecordedCall) => Response | Promise<Response>);

/** fetch double that replays queued responses and records every call. */
export function mockFetch(...responders: Responder[]) {
  const calls: RecordedCall[] = [];
  const queue = [...responders];
  const fetch = async (input: string, init: RequestInit): Promise<Response> => {
    const call: RecordedCall = {
      url: input,
      method: init.method ?? "GET",
      headers: new Headers(init.headers),
      body: init.body,
      signal: init.signal,
    };
    calls.push(call);
    const next = queue.shift();
    if (next === undefined) throw new Error(`Unexpected request: ${call.method} ${call.url}`);
    if (next instanceof Error) throw next;
    if (typeof next === "function") return next(call);
    return next;
  };
  return { fetch, calls };
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

export function empty(status = 200, headers: Record<string, string> = {}): Response {
  return new Response(null, { status, headers });
}

/** Client wired to a mock fetch, with retries delays set to zero by default. */
export function testClient(
  fetch: NonNullable<RobloxOpenCloudConfig["fetch"]>,
  config: Partial<RobloxOpenCloudConfig> = {},
): RobloxOpenCloud {
  return new RobloxOpenCloud({
    apiKey: TEST_API_KEY,
    fetch,
    ...config,
    retry: { baseDelayMs: 0, random: () => 0, ...config.retry },
  });
}

/** Parses a recorded JSON request body. */
export function bodyOf(call: RecordedCall | undefined): unknown {
  if (call === undefined) throw new Error("no call recorded");
  return JSON.parse(String(call.body));
}

/** Path + query of a recorded call, relative to the default base URL. */
export function target(call: RecordedCall | undefined): string {
  if (call === undefined) throw new Error("no call recorded");
  return call.url.replace("https://apis.roblox.com", "");
}

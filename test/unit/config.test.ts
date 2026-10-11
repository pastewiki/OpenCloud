import { inspect } from "node:util";
import { describe, expect, it } from "vitest";
import {
  API_KEY_ENV_VAR,
  ApiKeyAuth,
  ConfigurationError,
  OAuth2BearerAuth,
  RobloxOpenCloud,
} from "../../src/index.js";
import { TEST_API_KEY, json, mockFetch } from "../helpers.js";

describe("configuration", () => {
  it("requires a credential", () => {
    expect(() => new RobloxOpenCloud({ env: {} })).toThrow(ConfigurationError);
    expect(() => new RobloxOpenCloud({ env: {} })).toThrow(API_KEY_ENV_VAR);
  });

  it("reads the API key from the environment", async () => {
    const { fetch, calls } = mockFetch(json({ path: "universes/1" }));
    const client = new RobloxOpenCloud({ env: { [API_KEY_ENV_VAR]: TEST_API_KEY }, fetch });
    await client.universes.get({ universeId: 1 });
    expect(calls[0]?.headers.get("x-api-key")).toBe(TEST_API_KEY);
  });

  it("rejects multiple credential sources", () => {
    expect(
      () => new RobloxOpenCloud({ apiKey: TEST_API_KEY, accessToken: "token", env: {} }),
    ).toThrow(/only one/);
  });

  it("rejects malformed API keys early", () => {
    expect(() => new ApiKeyAuth("")).toThrow(ConfigurationError);
    expect(() => new ApiKeyAuth(` ${TEST_API_KEY}`)).toThrow(/whitespace/);
    expect(() => new ApiKeyAuth(`${TEST_API_KEY}\n`)).toThrow(/whitespace/);
  });

  it.each([
    ["not a url", /valid URL/],
    ["ftp://example.com", /http or https/],
    ["https://user:pass@example.com", /credentials/],
    ["https://example.com?x=1", /query/],
  ])("rejects baseUrl %s", (baseUrl, message) => {
    expect(() => new RobloxOpenCloud({ apiKey: TEST_API_KEY, baseUrl })).toThrow(message);
  });

  it("strips a trailing slash from baseUrl", async () => {
    const { fetch, calls } = mockFetch(json({ path: "universes/1" }));
    const client = new RobloxOpenCloud({
      apiKey: TEST_API_KEY,
      baseUrl: "https://proxy.example.com/roblox/",
      fetch,
    });
    await client.universes.get({ universeId: 1 });
    expect(calls[0]?.url).toBe("https://proxy.example.com/roblox/cloud/v2/universes/1");
  });

  it("validates timeout and retry options", () => {
    expect(() => new RobloxOpenCloud({ apiKey: TEST_API_KEY, timeoutMs: 0 })).toThrow(/timeoutMs/);
    expect(() => new RobloxOpenCloud({ apiKey: TEST_API_KEY, retry: { maxAttempts: 0 } })).toThrow(
      /maxAttempts/,
    );
    expect(
      () => new RobloxOpenCloud({ apiKey: TEST_API_KEY, retry: { maxAttempts: 1000 } }),
    ).toThrow(/maxAttempts/);
  });

  it("refuses to run in a browser-like environment unless explicitly allowed", () => {
    const g = globalThis as Record<string, unknown>;
    g.window = {};
    g.document = {};
    try {
      expect(() => new RobloxOpenCloud({ apiKey: TEST_API_KEY })).toThrow(/server-side/);
      expect(
        () => new RobloxOpenCloud({ apiKey: TEST_API_KEY, dangerouslyAllowBrowser: true }),
      ).not.toThrow();
    } finally {
      delete g.window;
      delete g.document;
    }
  });

  it("never exposes the API key through inspect or JSON", () => {
    const client = new RobloxOpenCloud({ apiKey: TEST_API_KEY });
    const auth = new ApiKeyAuth(TEST_API_KEY);
    for (const value of [client, auth, client.http]) {
      expect(inspect(value, { depth: 10, showHidden: true })).not.toContain(TEST_API_KEY);
      expect(JSON.stringify(value)).not.toContain(TEST_API_KEY);
    }
  });

  it("appends a custom user agent", async () => {
    const { fetch, calls } = mockFetch(json({ path: "universes/1" }));
    const client = new RobloxOpenCloud({ apiKey: TEST_API_KEY, fetch, userAgent: "my-tool/1.0" });
    await client.universes.get({ universeId: 1 });
    expect(calls[0]?.headers.get("user-agent")).toMatch(
      /^roblox-open-cloud-sdk-ts\/\S+ my-tool\/1\.0$/,
    );
  });
});

describe("OAuth 2.0 bearer auth", () => {
  it("sends Authorization: Bearer and never x-api-key", async () => {
    const { fetch, calls } = mockFetch(json({ path: "universes/1" }));
    const client = new RobloxOpenCloud({ accessToken: "oauth-token-value-123", fetch });
    await client.universes.get({ universeId: 1 });
    expect(calls[0]?.headers.get("authorization")).toBe("Bearer oauth-token-value-123");
    expect(calls[0]?.headers.has("x-api-key")).toBe(false);
  });

  it("calls the token supplier for every request", async () => {
    const { fetch, calls } = mockFetch(
      json({ path: "universes/1" }),
      json({ path: "universes/1" }),
    );
    let n = 0;
    const client = new RobloxOpenCloud({ accessToken: () => `token-${++n}`, fetch });
    await client.universes.get({ universeId: 1 });
    await client.universes.get({ universeId: 1 });
    expect(calls.map((c) => c.headers.get("authorization"))).toEqual([
      "Bearer token-1",
      "Bearer token-2",
    ]);
  });

  it("rejects API-key-only endpoints before sending a request", async () => {
    const { fetch, calls } = mockFetch();
    const client = new RobloxOpenCloud({ auth: new OAuth2BearerAuth("oauth-token"), fetch });
    await expect(
      client.dataStores.getEntry({ universeId: 1, dataStoreId: "s", entryId: "k" }),
    ).rejects.toThrow(/does not accept oauth2/);
    expect(calls).toHaveLength(0);
  });

  it("rejects an empty token from the supplier", async () => {
    const { fetch } = mockFetch();
    const client = new RobloxOpenCloud({ accessToken: () => "", fetch });
    await expect(client.universes.get({ universeId: 1 })).rejects.toThrow(/empty token/);
  });
});

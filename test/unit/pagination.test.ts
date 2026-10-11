import { describe, expect, it } from "vitest";
import {
  AbortError,
  ConfigurationError,
  PaginationError,
  Paginator,
  type Page,
} from "../../src/index.js";
import { json, mockFetch, target, testClient } from "../helpers.js";

function pagesOf(...pages: Page<number>[]) {
  const requested: (string | undefined)[] = [];
  const paginator = (options = {}) =>
    new Paginator<number>(async (token) => {
      requested.push(token);
      const page = pages[requested.length - 1];
      if (page === undefined) throw new Error("fetched past the last page");
      return page;
    }, options);
  return { paginator, requested };
}

describe("Paginator", () => {
  it("does not fetch until iterated", () => {
    const { paginator, requested } = pagesOf({ items: [1], nextPageToken: undefined });
    paginator();
    expect(requested).toEqual([]);
  });

  it("iterates items across pages lazily", async () => {
    const { paginator, requested } = pagesOf(
      { items: [1, 2], nextPageToken: "a" },
      { items: [3], nextPageToken: "b" },
      { items: [4], nextPageToken: undefined },
    );
    const seen: number[] = [];
    for await (const n of paginator()) {
      seen.push(n);
      if (n === 1) expect(requested).toEqual([undefined]); // only the first page so far
    }
    expect(seen).toEqual([1, 2, 3, 4]);
    expect(requested).toEqual([undefined, "a", "b"]);
  });

  it("stops at maxItems without fetching extra pages", async () => {
    const { paginator, requested } = pagesOf(
      { items: [1, 2], nextPageToken: "a" },
      { items: [3, 4], nextPageToken: "b" },
    );
    expect(await paginator({ maxItems: 3 }).toArray()).toEqual([1, 2, 3]);
    expect(requested).toEqual([undefined, "a"]);
  });

  it("stops at maxPages", async () => {
    const { paginator, requested } = pagesOf(
      { items: [1], nextPageToken: "a" },
      { items: [2], nextPageToken: "b" },
    );
    expect(await paginator({ maxPages: 1 }).toArray()).toEqual([1]);
    expect(requested).toEqual([undefined]);
  });

  it("resumes from a pageToken", async () => {
    const { paginator, requested } = pagesOf({ items: [9], nextPageToken: undefined });
    await paginator({ pageToken: "resume" }).toArray();
    expect(requested).toEqual(["resume"]);
  });

  it("throws PaginationError when a page token repeats", async () => {
    const { paginator } = pagesOf(
      { items: [1], nextPageToken: "a" },
      { items: [2], nextPageToken: "b" },
      { items: [3], nextPageToken: "a" },
    );
    await expect(paginator().toArray()).rejects.toBeInstanceOf(PaginationError);
  });

  it("treats a token equal to the starting token as a loop", async () => {
    const { paginator } = pagesOf({ items: [1], nextPageToken: "start" });
    await expect(paginator({ pageToken: "start" }).toArray()).rejects.toBeInstanceOf(
      PaginationError,
    );
  });

  it("handles empty pages that still carry a token", async () => {
    const { paginator } = pagesOf(
      { items: [], nextPageToken: "a" },
      { items: [1], nextPageToken: undefined },
    );
    expect(await paginator().toArray()).toEqual([1]);
  });

  it("respects an aborted signal between pages", async () => {
    const controller = new AbortController();
    const { paginator } = pagesOf(
      { items: [1], nextPageToken: "a" },
      { items: [2], nextPageToken: undefined },
    );
    const seen: number[] = [];
    await expect(
      (async () => {
        for await (const n of paginator({ signal: controller.signal })) {
          seen.push(n);
          controller.abort();
        }
      })(),
    ).rejects.toBeInstanceOf(AbortError);
    expect(seen).toEqual([1]);
  });

  it("validates limits", () => {
    expect(
      () => new Paginator(async () => ({ items: [], nextPageToken: undefined }), { maxItems: 0 }),
    ).toThrow(ConfigurationError);
  });

  it("exposes byPage and getPage", async () => {
    const { paginator } = pagesOf(
      { items: [1], nextPageToken: "a" },
      { items: [2], nextPageToken: undefined },
    );
    const pages: Page<number>[] = [];
    for await (const page of paginator().byPage()) pages.push(page);
    expect(pages.map((p) => p.items)).toEqual([[1], [2]]);
  });
});

describe("paginated endpoints", () => {
  it("sends maxPageSize and keeps other query params stable across pages", async () => {
    const { fetch, calls } = mockFetch(
      json({ dataStoreEntries: [{ path: "p1", id: "a" }], nextPageToken: "t1" }),
      json({ dataStoreEntries: [{ path: "p2", id: "b" }], nextPageToken: "" }),
    );
    const client = testClient(fetch);
    const ids: string[] = [];
    for await (const entry of client.dataStores.listEntries({
      universeId: 1,
      dataStoreId: "Profiles",
      pageSize: 50,
      filter: 'id.startsWith("a")',
    })) {
      ids.push(entry.id);
    }
    expect(ids).toEqual(["a", "b"]);
    expect(target(calls[0])).toBe(
      "/cloud/v2/universes/1/data-stores/Profiles/entries?filter=id.startsWith%28%22a%22%29&maxPageSize=50",
    );
    expect(target(calls[1])).toBe(
      "/cloud/v2/universes/1/data-stores/Profiles/entries?filter=id.startsWith%28%22a%22%29&maxPageSize=50&pageToken=t1",
    );
  });

  it("retries a rate-limited page and continues", async () => {
    const { fetch, calls } = mockFetch(
      json({ dataStores: [{ path: "x", id: "a" }], nextPageToken: "t1" }),
      json({ code: "RESOURCE_EXHAUSTED", message: "x" }, 429, { "retry-after": "0" }),
      json({ dataStores: [{ path: "y", id: "b" }] }),
    );
    const stores = await testClient(fetch).dataStores.listDataStores({ universeId: 1 }).toArray();
    expect(stores.map((s) => s.id)).toEqual(["a", "b"]);
    expect(calls).toHaveLength(3);
  });

  it("validates pageSize", () => {
    const { fetch } = mockFetch();
    expect(() =>
      testClient(fetch).dataStores.listDataStores({ universeId: 1, pageSize: -1 }),
    ).toThrow(/pageSize/);
  });
});

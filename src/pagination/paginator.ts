import { AbortError, ConfigurationError, PaginationError } from "../errors/errors.js";
import type { RequestOptions } from "../transport/types.js";

/** One page of a cursor-paginated list (`pageToken` / `nextPageToken`). */
export interface Page<T> {
  items: T[];
  /** Pass to the next request to continue. `undefined` when there are no more pages. */
  nextPageToken: string | undefined;
}

export interface PaginationOptions {
  /** Stop after yielding this many items in total. */
  maxItems?: number;
  /** Stop after fetching this many pages. */
  maxPages?: number;
  /** Resume from a token returned by an earlier call. */
  pageToken?: string;
}

export type ListOptions = RequestOptions & PaginationOptions;

export type PageFetcher<T> = (
  pageToken: string | undefined,
  options: RequestOptions,
) => Promise<Page<T>>;

/**
 * Lazy, cancellable iterator over a cursor-paginated Open Cloud list.
 *
 * Nothing is fetched until you iterate. Pages are requested one at a time, as
 * they are consumed, and each page request goes through the client's normal
 * retry and rate-limit handling.
 *
 * ```ts
 * for await (const item of paginator) { ... }        // item by item
 * for await (const page of paginator.byPage()) { ... } // page by page
 * const page = await paginator.getPage();            // a single page
 * ```
 *
 * Per Roblox's pagination rules, all other query parameters stay identical
 * across pages; the paginator only changes `pageToken`.
 */
export class Paginator<T> implements AsyncIterable<T> {
  readonly #fetchPage: PageFetcher<T>;
  readonly #options: ListOptions;

  constructor(fetchPage: PageFetcher<T>, options: ListOptions = {}) {
    for (const key of ["maxItems", "maxPages"] as const) {
      const value = options[key];
      if (value !== undefined && (!Number.isInteger(value) || value <= 0)) {
        throw new ConfigurationError(`${key} must be a positive integer`);
      }
    }
    this.#fetchPage = fetchPage;
    this.#options = options;
  }

  /** Fetches exactly one page. Defaults to the starting `pageToken`, if any. */
  async getPage(pageToken: string | undefined = this.#options.pageToken): Promise<Page<T>> {
    return this.#fetchPage(pageToken, this.#requestOptions());
  }

  /** Iterates page by page, honoring `maxPages` and `maxItems`. */
  async *byPage(): AsyncGenerator<Page<T>, void, undefined> {
    const { maxItems, maxPages, signal } = this.#options;
    const seen = new Set<string>();
    let token = this.#options.pageToken;
    let pages = 0;
    let items = 0;

    if (token !== undefined) seen.add(token);
    for (;;) {
      if (signal?.aborted) throw new AbortError(undefined, { cause: signal.reason });
      const page = await this.#fetchPage(token, this.#requestOptions());
      pages++;

      if (maxItems !== undefined && items + page.items.length > maxItems) {
        yield { items: page.items.slice(0, maxItems - items), nextPageToken: page.nextPageToken };
        return;
      }
      items += page.items.length;
      yield page;

      const next = page.nextPageToken;
      if (next === undefined) return;
      if (maxItems !== undefined && items >= maxItems) return;
      if (maxPages !== undefined && pages >= maxPages) return;
      if (seen.has(next)) {
        throw new PaginationError(
          `The API returned a page token that was already used ("${next}"); stopping to avoid an infinite loop`,
        );
      }
      seen.add(next);
      token = next;
    }
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<T, void, undefined> {
    for await (const page of this.byPage()) {
      yield* page.items;
    }
  }

  /**
   * Collects all items into an array. Prefer iteration for large lists; set
   * `maxItems` or `maxPages` to bound memory use and request count.
   */
  async toArray(): Promise<T[]> {
    const out: T[] = [];
    for await (const page of this.byPage()) out.push(...page.items);
    return out;
  }

  #requestOptions(): RequestOptions {
    const { signal, timeoutMs, retry } = this.#options;
    const options: RequestOptions = {};
    if (signal !== undefined) options.signal = signal;
    if (timeoutMs !== undefined) options.timeoutMs = timeoutMs;
    if (retry !== undefined) options.retry = retry;
    return options;
  }
}

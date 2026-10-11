import { Paginator, type ListOptions, type Page } from "../pagination/paginator.js";
import type { HttpClient } from "../transport/http-client.js";
import type { HttpRequest, RequestOptions } from "../transport/types.js";
import {
  expectArrayField,
  expectRecord,
  optionalPositiveInt,
  readNextPageToken,
} from "../utils/guards.js";
import type { AuthKind } from "../auth/providers.js";

export const API_KEY_ONLY: readonly AuthKind[] = ["apiKey"];
export const API_KEY_OR_OAUTH: readonly AuthKind[] = ["apiKey", "oauth2"];

/**
 * Builds a {@link Paginator} for a v2-style list endpoint that accepts
 * `maxPageSize`/`pageToken` and returns `{ <itemsField>: T[], nextPageToken }`.
 */
export function paginateV2<T>(
  http: HttpClient,
  request: HttpRequest,
  itemsField: string,
  pageSize: number | undefined,
  options: ListOptions | undefined,
): Paginator<T> {
  optionalPositiveInt(pageSize, "pageSize");
  const what = `${request.method} ${request.path}`;
  return new Paginator<T>(async (pageToken, requestOptions) => {
    const res = await http.request(
      {
        ...request,
        query: { ...request.query, maxPageSize: pageSize, pageToken },
      },
      requestOptions,
    );
    return parseV2Page<T>(res.data, itemsField, what);
  }, options);
}

export function parseV2Page<T>(data: unknown, itemsField: string, what: string): Page<T> {
  const body = expectRecord(data, what);
  return {
    items: expectArrayField(body, itemsField, what) as T[],
    nextPageToken: readNextPageToken(body, what),
  };
}

/** Sends a request and validates that the response body is a JSON object. */
export async function requestObject<T>(
  http: HttpClient,
  request: HttpRequest,
  options: RequestOptions | undefined,
): Promise<T> {
  const res = await http.request(request, options);
  return expectRecord(res.data, `${request.method} ${request.path}`) as T;
}

/** Sends a request whose successful response has no meaningful body. */
export async function requestVoid(
  http: HttpClient,
  request: HttpRequest,
  options: RequestOptions | undefined,
): Promise<void> {
  await http.request(request, options);
}

/**
 * Derives a field mask (`updateMask`) from the keys of a partial update,
 * e.g. `{ displayName, description }` -> `"displayName,description"`.
 */
export function fieldMaskFrom(update: object): string {
  return Object.entries(update)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key)
    .join(",");
}

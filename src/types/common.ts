/**
 * A Roblox numeric ID (universe, place, user, group, asset). Roblox IDs are
 * int64, so pass a string or bigint for values above `Number.MAX_SAFE_INTEGER`.
 * Responses always return IDs as strings.
 */
export type RobloxId = string | number | bigint;

/** RFC 3339 timestamp string as returned by Open Cloud, e.g. `2023-07-05T12:34:56Z`. */
export type Timestamp = string;

/** Any JSON value. Data store entry values are arbitrary JSON. */
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** Pagination parameter shared by list endpoints (`maxPageSize`). */
export interface PageSizeParam {
  /**
   * Maximum items per page (`maxPageSize`). The service may return fewer.
   * Each endpoint documents its own default and maximum.
   */
  pageSize?: number;
}

/**
 * Tagged template that percent-encodes every interpolated value as a single
 * path segment, so IDs like `my/key` or `a?b` cannot change the request path.
 *
 * ```ts
 * path`/cloud/v2/universes/${universeId}/data-stores/${name}`
 * ```
 */
export function path(strings: TemplateStringsArray, ...values: readonly string[]): string {
  let out = strings[0] ?? "";
  values.forEach((value, i) => {
    out += encodeURIComponent(value) + (strings[i + 1] ?? "");
  });
  return out;
}

/** Serializes query parameters, omitting `undefined` values. */
export function buildQuery(query: Record<string, string | number | boolean | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.append(key, String(value));
  }
  const text = params.toString();
  return text === "" ? "" : `?${text}`;
}

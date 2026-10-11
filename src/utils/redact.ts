/** Header names whose values are always replaced before reaching logging hooks. */
const SENSITIVE_HEADERS = new Set(["x-api-key", "authorization", "cookie", "set-cookie"]);

export const REDACTED = "[REDACTED]";

/** Returns a plain-object copy of `headers` with credential values replaced. */
export function redactHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key] = SENSITIVE_HEADERS.has(key.toLowerCase()) ? REDACTED : value;
  });
  return out;
}

/**
 * Replaces every occurrence of the given secrets in `text`. Used as a final
 * safety net on messages that might echo request data (for example, a
 * misbehaving proxy reflecting headers into an error body).
 */
export function redactSecrets(text: string, secrets: readonly string[]): string {
  let out = text;
  for (const secret of secrets) {
    // Very short strings would cause false positives; real keys are long.
    if (secret.length >= 8) out = out.split(secret).join(REDACTED);
  }
  return out;
}

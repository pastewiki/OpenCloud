import { ConfigurationError, ResponseValidationError } from "../errors/errors.js";

/** True for non-null, non-array objects. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Throws {@link ConfigurationError} unless `value` is a non-empty string. */
export function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ConfigurationError(`${name} must be a non-empty string`);
  }
  return value;
}

/**
 * Accepts a Roblox numeric ID as a string or a safe integer and returns its
 * decimal string form. IDs are int64 on the server, so strings are preferred
 * for values above `Number.MAX_SAFE_INTEGER`.
 */
export function requireId(value: unknown, name: string): string {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new ConfigurationError(
        `${name} must be a non-negative safe integer or a numeric string`,
      );
    }
    return String(value);
  }
  if (typeof value === "bigint") {
    if (value < 0n) throw new ConfigurationError(`${name} must be non-negative`);
    return value.toString();
  }
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new ConfigurationError(`${name} must be a numeric ID (string, number, or bigint)`);
  }
  return value;
}

/** Validates an optional positive integer option. */
export function optionalPositiveInt(value: unknown, name: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new ConfigurationError(`${name} must be a positive integer`);
  }
  return value;
}

/**
 * Lightweight runtime check that a response body is an object. The SDK does not
 * deep-validate every field; it checks the structure it relies on (objects and
 * list arrays) so API drift surfaces as a clear error instead of a crash.
 */
export function expectRecord(body: unknown, what: string): Record<string, unknown> {
  if (!isRecord(body)) {
    throw new ResponseValidationError(`Expected ${what} to be a JSON object`, body);
  }
  return body;
}

/** Reads an optional array field from a list response, validating its type. */
export function expectArrayField(
  body: Record<string, unknown>,
  field: string,
  what: string,
): unknown[] {
  const value = body[field];
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new ResponseValidationError(`Expected ${what}.${field} to be an array`, body);
  }
  return value;
}

/** Reads `nextPageToken`, treating empty/omitted values as "no more pages". */
export function readNextPageToken(body: Record<string, unknown>, what: string): string | undefined {
  const token = body.nextPageToken;
  if (token === undefined || token === null || token === "") return undefined;
  if (typeof token !== "string") {
    throw new ResponseValidationError(`Expected ${what}.nextPageToken to be a string`, body);
  }
  return token;
}

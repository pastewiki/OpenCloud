import { isRecord } from "../utils/guards.js";
import {
  ApiError,
  type ApiErrorInit,
  AuthenticationError,
  ConflictError,
  NotFoundError,
  PermissionError,
  RateLimitError,
  ValidationError,
} from "./errors.js";

/** Normalized fields extracted from any documented Open Cloud error body. */
export interface ParsedErrorBody {
  code?: string | number;
  message?: string;
  details?: readonly unknown[];
  traceId?: string;
}

/**
 * Extracts code/message/details from the error body shapes documented at
 * https://create.roblox.com/docs/cloud/reference/errors:
 *
 * - Gateway (v1 and v2): `{ errors: [{ code, message }] }`
 * - Open Cloud v2:       `{ code, message, details? }`
 * - Open Cloud v1:       `{ error, message, errorDetails? }`, `{ code, message }`, or a
 *   validation problem `{ errors: { field: string[] }, title, status, extensions: { traceId } }`
 *
 * Unrecognized bodies yield an empty object; callers fall back to the HTTP status text.
 */
export function parseErrorBody(body: unknown): ParsedErrorBody {
  if (!isRecord(body)) return {};
  const out: ParsedErrorBody = {};

  // Gateway shape: errors is an array.
  if (Array.isArray(body.errors)) {
    const first: unknown = body.errors[0];
    if (isRecord(first)) {
      if (typeof first.code === "string" || typeof first.code === "number") out.code = first.code;
      if (typeof first.message === "string") out.message = first.message;
    }
    if (body.errors.length > 1) out.details = body.errors;
    return out;
  }

  if (typeof body.code === "string" || typeof body.code === "number") out.code = body.code;
  else if (typeof body.error === "string") out.code = body.error;

  if (typeof body.message === "string") out.message = body.message;

  if (Array.isArray(body.details)) out.details = body.details;
  else if (Array.isArray(body.errorDetails)) out.details = body.errorDetails;

  // v1 validation problem details: errors is an object of field -> messages.
  if (isRecord(body.errors)) {
    const parts: string[] = [];
    for (const [field, messages] of Object.entries(body.errors)) {
      const text = Array.isArray(messages) ? messages.filter((m) => typeof m === "string") : [];
      parts.push(text.length > 0 ? `${field}: ${text.join("; ")}` : field);
    }
    const title = typeof body.title === "string" ? body.title : "Validation failed";
    out.message ??= parts.length > 0 ? `${title} (${parts.join(", ")})` : title;
    out.details ??= [body.errors];
  }
  if (isRecord(body.extensions) && typeof body.extensions.traceId === "string") {
    out.traceId = body.extensions.traceId;
  }

  return out;
}

/** HTTP statuses the SDK treats as transient. */
export const RETRYABLE_STATUSES: ReadonlySet<number> = new Set([429, 500, 502, 503, 504]);

/** Builds the most specific {@link ApiError} subclass for an HTTP status. */
export function createApiError(init: ApiErrorInit): ApiError {
  const withRetry: ApiErrorInit = {
    ...init,
    retryable: init.retryable ?? RETRYABLE_STATUSES.has(init.status),
  };
  switch (init.status) {
    case 400:
      return new ValidationError(withRetry);
    case 401:
      return new AuthenticationError(withRetry);
    case 403:
      return new PermissionError(withRetry);
    case 404:
      return new NotFoundError(withRetry);
    case 409:
      return new ConflictError(withRetry);
    case 429:
      return new RateLimitError(withRetry);
    default:
      // Unknown statuses (including 5xx) stay generic rather than being
      // misclassified as a more specific error.
      return new ApiError(withRetry);
  }
}

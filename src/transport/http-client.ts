import type { AuthProvider } from "../auth/providers.js";
import {
  AbortError,
  ConfigurationError,
  NetworkError,
  ResponseValidationError,
  RobloxOpenCloudError,
  TimeoutError,
} from "../errors/errors.js";
import { createApiError, parseErrorBody } from "../errors/parse.js";
import { parseRateLimitHeaders, parseRetryAfter } from "../rate-limit/headers.js";
import {
  computeRetryDelay,
  resolveRetryOptions,
  shouldRetry,
  type ResolvedRetryOptions,
} from "../retry/policy.js";
import { sleep } from "../retry/sleep.js";
import { redactHeaders, redactSecrets } from "../utils/redact.js";
import { buildQuery } from "./path.js";
import type {
  FetchLike,
  HttpRequest,
  HttpResponse,
  RawBody,
  RequestOptions,
  TransportHooks,
} from "./types.js";

/**
 * Roblox does not document a request-ID response header, and none appeared in
 * responses observed while building this SDK. These common names are checked
 * on a best-effort basis; v1 validation errors also carry `extensions.traceId`.
 */
const REQUEST_ID_HEADERS = ["x-roblox-request-id", "x-request-id", "request-id"] as const;

/** Error bodies are truncated to this many characters when kept as text. */
const MAX_ERROR_TEXT = 2_000;

export interface HttpClientOptions {
  baseUrl: string;
  auth: AuthProvider;
  fetch: FetchLike;
  timeoutMs: number;
  retry: ResolvedRetryOptions;
  userAgent: string;
  hooks: TransportHooks;
}

/**
 * Shared transport: builds URLs, attaches credentials, enforces timeouts,
 * retries transient failures, and converts failures into typed errors.
 */
export class HttpClient {
  readonly #options: HttpClientOptions;

  constructor(options: HttpClientOptions) {
    this.#options = options;
  }

  /** Credential kind of the configured auth provider. */
  get authKind(): AuthProvider["kind"] {
    return this.#options.auth.kind;
  }

  async request<T = unknown>(
    request: HttpRequest,
    options: RequestOptions = {},
  ): Promise<HttpResponse<T>> {
    const { auth } = this.#options;
    if (!request.auth.includes(auth.kind)) {
      const accepted = request.auth.join(", ");
      throw new ConfigurationError(
        `${request.method} ${request.path} does not accept ${auth.kind} credentials ` +
          `(accepted: ${accepted}). See the API reference for this endpoint.`,
      );
    }
    const retry =
      options.retry === undefined
        ? this.#options.retry
        : resolveRetryOptions(options.retry, this.#options.retry);
    const timeoutMs = options.timeoutMs ?? this.#options.timeoutMs;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new ConfigurationError("timeoutMs must be a positive number");
    }
    const idempotent =
      request.idempotent ??
      (request.method === "GET" || request.method === "PUT" || request.method === "DELETE");
    const url = this.#options.baseUrl + request.path + buildQuery(request.query ?? {});

    for (let attempt = 1; ; attempt++) {
      try {
        return await this.#attempt<T>(request, url, attempt, timeoutMs, options.signal);
      } catch (error) {
        if (!shouldRetry(error, attempt, idempotent, retry)) throw error;
        const delayMs = computeRetryDelay(error, attempt, retry);
        safeHook(() =>
          this.#options.hooks.onRetry?.({ method: request.method, url, attempt, delayMs, error }),
        );
        await sleep(delayMs, options.signal);
      }
    }
  }

  async #attempt<T>(
    request: HttpRequest,
    url: string,
    attempt: number,
    timeoutMs: number,
    signal: AbortSignal | undefined,
  ): Promise<HttpResponse<T>> {
    if (signal?.aborted) throw new AbortError(undefined, { cause: signal.reason });

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const onAbort = (): void => {
      controller.abort(signal?.reason);
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    const started = Date.now();
    try {
      const headers = new Headers({
        accept: "application/json",
        "user-agent": this.#options.userAgent,
      });
      await this.#options.auth.apply(headers, controller.signal);
      const body = encodeBody(request.body, headers);

      safeHook(() =>
        this.#options.hooks.onRequest?.({
          method: request.method,
          url,
          headers: redactHeaders(headers),
          attempt,
        }),
      );

      let response: Response;
      try {
        const init: RequestInit = { method: request.method, headers, signal: controller.signal };
        if (body !== undefined) init.body = body;
        response = await this.#options.fetch(url, init);
      } catch (error) {
        throw this.#classifyFetchFailure(error, timedOut, signal, timeoutMs, request);
      }

      // Read the body inside the timeout window so a stalled stream also times out.
      let text: string;
      try {
        text = await response.text();
      } catch (error) {
        throw this.#classifyFetchFailure(error, timedOut, signal, timeoutMs, request);
      }

      const rateLimit = parseRateLimitHeaders(response.headers);
      const requestIdFromHeader = readRequestId(response.headers);
      safeHook(() =>
        this.#options.hooks.onResponse?.({
          method: request.method,
          url,
          attempt,
          status: response.status,
          durationMs: Date.now() - started,
          requestId: requestIdFromHeader,
          rateLimit,
        }),
      );

      if (!response.ok) {
        throw this.#buildApiError(request, response, text, rateLimit, requestIdFromHeader);
      }

      return {
        status: response.status,
        data: parseSuccessBody(text, request) as T,
        headers: response.headers,
        requestId: requestIdFromHeader,
        rateLimit,
      };
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  }

  #classifyFetchFailure(
    error: unknown,
    timedOut: boolean,
    signal: AbortSignal | undefined,
    timeoutMs: number,
    request: HttpRequest,
  ): RobloxOpenCloudError {
    if (error instanceof RobloxOpenCloudError) return error;
    if (signal?.aborted) return new AbortError(undefined, { cause: signal.reason });
    if (timedOut) {
      return new TimeoutError(
        `${request.method} ${request.path} timed out after ${timeoutMs} ms`,
        timeoutMs,
        { cause: error },
      );
    }
    const detail = error instanceof Error ? error.message : String(error);
    return new NetworkError(
      redactSecrets(
        `${request.method} ${request.path} failed: ${detail}`,
        this.#options.auth.secrets(),
      ),
      { cause: error },
    );
  }

  #buildApiError(
    request: HttpRequest,
    response: Response,
    text: string,
    rateLimit: ReturnType<typeof parseRateLimitHeaders>,
    requestIdFromHeader: string | undefined,
  ): RobloxOpenCloudError {
    const secrets = this.#options.auth.secrets();
    const safeText = redactSecrets(text, secrets);
    const json = tryParseJson(safeText);
    const parsed = parseErrorBody(json.ok ? json.value : undefined);
    const fallback = response.statusText !== "" ? response.statusText : `HTTP ${response.status}`;
    const requestId = requestIdFromHeader ?? parsed.traceId;
    const retryAfterMs = parseRetryAfter(response.headers.get("retry-after"));

    return createApiError({
      status: response.status,
      message: redactSecrets(parsed.message ?? fallback, secrets),
      method: request.method,
      path: request.path,
      body: json.ok ? json.value : safeText.slice(0, MAX_ERROR_TEXT),
      ...(parsed.code !== undefined && { code: parsed.code }),
      ...(parsed.details !== undefined && { details: parsed.details }),
      ...(requestId !== undefined && { requestId }),
      ...(retryAfterMs !== undefined && { retryAfterMs }),
      ...(rateLimit !== undefined && { rateLimit }),
    });
  }
}

function isRawBody(body: unknown): body is RawBody {
  return typeof body === "object" && body !== null && (body as { kind?: unknown }).kind === "raw";
}

function encodeBody(body: unknown, headers: Headers): BodyInit | undefined {
  if (body === undefined) return undefined;
  if (isRawBody(body)) {
    headers.set("content-type", body.contentType);
    return body.data as BodyInit;
  }
  headers.set("content-type", "application/json");
  return JSON.stringify(body);
}

function parseSuccessBody(text: string, request: HttpRequest): unknown {
  if (request.responseType === "text") return text;
  if (text.trim() === "") return undefined;
  const json = tryParseJson(text);
  if (!json.ok) {
    throw new ResponseValidationError(
      `${request.method} ${request.path} returned a non-JSON success body`,
      text.slice(0, MAX_ERROR_TEXT),
    );
  }
  return json.value;
}

function tryParseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  if (text.trim() === "") return { ok: false };
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}

function readRequestId(headers: Headers): string | undefined {
  for (const name of REQUEST_ID_HEADERS) {
    const value = headers.get(name);
    if (value !== null && value !== "") return value;
  }
  return undefined;
}

function safeHook(fn: () => void): void {
  try {
    fn();
  } catch (error) {
    // Hooks are for observability only; a failing hook must not fail the
    // request, but it is surfaced as a process warning rather than hidden.
    const detail = error instanceof Error ? error.message : String(error);
    process.emitWarning(`Roblox Open Cloud SDK transport hook threw: ${detail}`, {
      code: "ROBLOX_OPEN_CLOUD_HOOK_ERROR",
    });
  }
}

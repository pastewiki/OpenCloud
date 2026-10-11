import {
  ApiKeyAuth,
  OAuth2BearerAuth,
  type AccessTokenSupplier,
  type AuthProvider,
} from "./auth/providers.js";
import { ConfigurationError } from "./errors/errors.js";
import { resolveRetryOptions, type RetryOptions } from "./retry/policy.js";
import type { HttpClientOptions } from "./transport/http-client.js";
import type { FetchLike, TransportHooks } from "./transport/types.js";
import { SDK_VERSION } from "./version.js";

/** Environment variable read when no credential is passed explicitly. */
export const API_KEY_ENV_VAR = "ROBLOX_OPEN_CLOUD_API_KEY";

export const DEFAULT_BASE_URL = "https://apis.roblox.com";
export const DEFAULT_TIMEOUT_MS = 30_000;

export interface RobloxOpenCloudConfig {
  /**
   * Open Cloud API key, sent in the `x-api-key` header. If no credential option
   * is set, the SDK reads `process.env.ROBLOX_OPEN_CLOUD_API_KEY`.
   *
   * Never hard-code keys or ship them to browsers or Roblox client scripts.
   */
  apiKey?: string;
  /**
   * OAuth 2.0 access token, or a function returning a current token (for
   * example from your refresh logic). Sent as `Authorization: Bearer`.
   */
  accessToken?: string | AccessTokenSupplier;
  /** A custom {@link AuthProvider}. Mutually exclusive with `apiKey`/`accessToken`. */
  auth?: AuthProvider;
  /** Default `https://apis.roblox.com`. Override for proxies or test servers. */
  baseUrl?: string;
  /** Per-attempt timeout in milliseconds. Default 30 000. */
  timeoutMs?: number;
  /** Retry policy. See {@link RetryOptions}. */
  retry?: RetryOptions;
  /** fetch-compatible function. Defaults to the global `fetch` (Node 20+). */
  fetch?: FetchLike;
  /** Appended to the SDK's `user-agent` header, e.g. `"my-tool/1.2"`. */
  userAgent?: string;
  /** Observability hooks. They receive redacted data only. */
  hooks?: TransportHooks;
  /**
   * The SDK refuses to run in a browser-like environment because Open Cloud
   * credentials are secrets. Set to `true` only for trusted, non-public
   * contexts such as an internal Electron tool. Default `false`.
   */
  dangerouslyAllowBrowser?: boolean;
  /** Environment used for credential fallback. Defaults to `process.env`. */
  env?: Readonly<Record<string, string | undefined>>;
}

/** Validates configuration and produces transport options. */
export function resolveConfig(config: RobloxOpenCloudConfig): HttpClientOptions {
  if (!config.dangerouslyAllowBrowser && isBrowserLike()) {
    throw new ConfigurationError(
      "RobloxOpenCloud is for trusted server-side environments. Running it in a browser " +
        "would expose your credentials. Call Open Cloud from your backend instead.",
    );
  }

  const baseUrl = normalizeBaseUrl(config.baseUrl ?? DEFAULT_BASE_URL);
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new ConfigurationError("timeoutMs must be a positive number");
  }

  const fetchImpl = config.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new ConfigurationError(
      "No fetch implementation found. Use Node.js 20+ or pass `fetch` in the config.",
    );
  }

  const userAgent =
    `roblox-open-cloud-sdk-ts/${SDK_VERSION}` +
    (config.userAgent !== undefined && config.userAgent.trim() !== ""
      ? ` ${config.userAgent.trim()}`
      : "");

  return {
    baseUrl,
    auth: resolveAuth(config),
    fetch: fetchImpl,
    timeoutMs,
    retry: resolveRetryOptions(config.retry),
    userAgent,
    hooks: config.hooks ?? {},
  };
}

function resolveAuth(config: RobloxOpenCloudConfig): AuthProvider {
  const provided = [config.apiKey, config.accessToken, config.auth].filter((v) => v !== undefined);
  if (provided.length > 1) {
    throw new ConfigurationError("Pass only one of apiKey, accessToken, or auth");
  }
  if (config.auth !== undefined) return config.auth;
  if (config.accessToken !== undefined) return new OAuth2BearerAuth(config.accessToken);
  if (config.apiKey !== undefined) return new ApiKeyAuth(config.apiKey);

  const env = config.env ?? process.env;
  const fromEnv = env[API_KEY_ENV_VAR];
  if (fromEnv !== undefined && fromEnv.trim() !== "") return new ApiKeyAuth(fromEnv.trim());

  throw new ConfigurationError(
    `No credentials configured. Pass apiKey/accessToken/auth, or set ${API_KEY_ENV_VAR}.`,
  );
}

function normalizeBaseUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ConfigurationError(`baseUrl is not a valid URL`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new ConfigurationError("baseUrl must use http or https");
  }
  if (url.username !== "" || url.password !== "") {
    throw new ConfigurationError("baseUrl must not contain credentials");
  }
  if (url.search !== "" || url.hash !== "") {
    throw new ConfigurationError("baseUrl must not contain a query string or fragment");
  }
  return url.toString().replace(/\/+$/, "");
}

function isBrowserLike(): boolean {
  const g = globalThis as { window?: unknown; document?: unknown };
  return typeof g.window !== "undefined" && typeof g.document !== "undefined";
}

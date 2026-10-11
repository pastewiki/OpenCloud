/**
 * Example 6: handle rate limits.
 *
 * The SDK retries HTTP 429 automatically (honoring Retry-After), up to
 * `retry.maxAttempts`. When attempts run out, it throws RateLimitError.
 */
import { RateLimitError, RobloxOpenCloud } from "roblox-open-cloud-sdk";

const roblox = RobloxOpenCloud.fromEnv({
  retry: { maxAttempts: 5, baseDelayMs: 1_000, maxRetryAfterMs: 30_000 },
  hooks: {
    onResponse: ({ rateLimit }) => {
      if (rateLimit?.remaining !== undefined && rateLimit.remaining < 10) {
        console.warn(
          `Low quota: ${rateLimit.remaining} left, resets in ${rateLimit.resetSeconds ?? "?"}s`,
        );
      }
    },
    onRetry: ({ attempt, delayMs, error }) => {
      const name = error instanceof Error ? error.name : "error";
      console.warn(`Attempt ${attempt} failed (${name}); retrying in ${delayMs} ms`);
    },
  },
});

try {
  const stores = await roblox.dataStores
    .listDataStores({ universeId: process.env.ROBLOX_UNIVERSE_ID! })
    .toArray();
  console.log(`${stores.length} data stores`);
} catch (error) {
  if (error instanceof RateLimitError) {
    console.error(
      `Still rate limited after retries; retry after ${error.retryAfterMs ?? "unknown"} ms`,
      error.rateLimit,
    );
    process.exitCode = 1;
  } else {
    throw error;
  }
}

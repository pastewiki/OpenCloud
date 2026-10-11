import { AbortError } from "../errors/errors.js";

/** Resolves after `ms`, or rejects with {@link AbortError} if `signal` aborts first. */
export async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(
        new AbortError("The request was aborted while waiting to retry", { cause: signal.reason }),
      );
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(
        new AbortError("The request was aborted while waiting to retry", { cause: signal?.reason }),
      );
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

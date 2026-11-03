/**
 * How long to wait before retrying when Cloudflare gives no retry delay:
 * 1 second, doubling after each attempt, at most 10 seconds.
 *
 * @param attempt The attempt that just failed, starting at 1.
 * @returns The delay in milliseconds.
 */
export function backoffMilliseconds(attempt: number): number {
  return Math.min(1000 * Math.pow(2, attempt - 1), 10000);
}

/**
 * Waits for the given time, or until the signal aborts.
 *
 * @param ms The time to wait in milliseconds.
 * @param signal Optional signal that cuts the wait short.
 * @returns A promise that resolves when the time has passed.
 * @throws The signal's reason if it aborts first.
 */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

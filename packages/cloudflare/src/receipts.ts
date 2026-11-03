import { createFailedReceipt, type Receipt } from "@upyo/core";
import { CloudflareValidationError } from "./errors.ts";

/**
 * A failed receipt from either Cloudflare transport.
 */
export type CloudflareFailure = Receipt<"cloudflare"> & {
  readonly successful: false;
};

/**
 * Turns an error from `prepareMessage()` into a non-retryable validation
 * receipt, or returns `undefined` for any other error.
 *
 * @param error The error thrown while preparing a message.
 * @returns The failed receipt, or `undefined` if the error is not about the
 *          message.
 */
export function createValidationFailure(
  error: unknown,
): CloudflareFailure | undefined {
  if (error instanceof CloudflareValidationError) {
    return createFailedReceipt<"cloudflare">(error.message, {
      provider: "cloudflare",
      category: "validation",
      retryable: false,
      code: error.code,
    });
  }
  // Core throws these for an invalid message identifier or calendar.
  if (error instanceof TypeError || error instanceof RangeError) {
    return createFailedReceipt<"cloudflare">(error.message, {
      provider: "cloudflare",
      category: "validation",
      retryable: false,
    });
  }
  return undefined;
}

/**
 * Whether an error is the caller's own cancellation, which a transport
 * rethrows instead of turning into a receipt.
 *
 * @param error The error to check.
 * @param signal The caller's signal, if any.
 * @returns `true` if the caller aborted and the error is that abort.
 */
export function isCallerAbort(
  error: unknown,
  signal?: AbortSignal | null,
): boolean {
  return (
    signal?.aborted === true &&
    ((error instanceof Error && error.name === "AbortError") ||
      error === signal.reason)
  );
}

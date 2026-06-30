/**
 * Result of combining abort signals.
 *
 * @since 0.5.0
 */
export interface CombinedSignal {
  /**
   * The signal that aborts when any input signal aborts.
   */
  readonly signal: AbortSignal;

  /**
   * Removes fallback abort listeners when signal composition no longer needs
   * them.
   */
  cleanup(): void;
}

/**
 * Combines a primary abort signal with an optional external signal.
 *
 * The returned signal aborts as soon as either input signal aborts.  Runtimes
 * with `AbortSignal.any()` use the platform implementation; older runtimes use
 * a listener-based fallback that preserves the original abort reason.
 *
 * @param primarySignal The signal owned by the current operation.
 * @param externalSignal Optional caller-supplied signal to compose.
 * @returns A combined signal and cleanup callback.
 * @since 0.5.0
 */
export function combineSignals(
  primarySignal: AbortSignal,
  externalSignal?: AbortSignal | null,
): CombinedSignal {
  if (externalSignal == null) {
    return { signal: primarySignal, cleanup: () => {} };
  }

  if (typeof AbortSignal.any === "function") {
    return {
      signal: AbortSignal.any([primarySignal, externalSignal]),
      cleanup: () => {},
    };
  }

  const controller = new AbortController();
  const cleanup = () => {
    primarySignal.removeEventListener("abort", abortFromPrimary);
    externalSignal.removeEventListener("abort", abortFromExternal);
  };
  const abortFromPrimary = () => {
    cleanup();
    controller.abort(getAbortReason(primarySignal));
  };
  const abortFromExternal = () => {
    cleanup();
    controller.abort(getAbortReason(externalSignal));
  };

  if (primarySignal.aborted) {
    controller.abort(getAbortReason(primarySignal));
  } else if (externalSignal.aborted) {
    controller.abort(getAbortReason(externalSignal));
  } else {
    primarySignal.addEventListener("abort", abortFromPrimary, { once: true });
    externalSignal.addEventListener("abort", abortFromExternal, {
      once: true,
    });
  }

  return { signal: controller.signal, cleanup };
}

function getAbortReason(signal: AbortSignal): unknown {
  return signal.reason ??
    new DOMException("The operation was aborted.", "AbortError");
}

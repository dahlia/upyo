import {
  analyzeRawMessage,
  combineSignals,
  iterateRawMessage,
  type RawMessagePlan,
} from "@upyo/core";
import type { ResolvedJmapConfig } from "./config.ts";
import { JmapApiError } from "./errors.ts";
import type { BlobUploadResponse } from "./blob-uploader.ts";

/** Runs a raw operation with a progress-resettable deadline through response parsing. @internal */
export async function rawOperation<T>(
  timeout: number,
  operation: (signal: AbortSignal, progress: () => void) => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const combined = combineSignals(controller.signal, signal);
  let timer: ReturnType<typeof setTimeout>;
  let finished = false;
  const progress = () => {
    if (finished) return;
    clearTimeout(timer);
    timer = setTimeout(
      () => controller.abort(new JmapApiError("Raw JMAP operation timed out.")),
      timeout,
    );
  };
  let abort: (() => void) | undefined;
  try {
    combined.signal.throwIfAborted();
    progress();
    return await new Promise<T>((resolve, reject) => {
      abort = () => reject(combined.signal.reason);
      combined.signal.addEventListener("abort", abort, { once: true });
      Promise.resolve().then(() => {
        combined.signal.throwIfAborted();
        return operation(combined.signal, progress);
      }).then(resolve, reject);
      if (combined.signal.aborted) abort();
    });
  } finally {
    finished = true;
    clearTimeout(timer!);
    if (abort) combined.signal.removeEventListener("abort", abort);
    controller.abort();
    combined.cleanup();
  }
}

/** @internal */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Streams validated MIME bytes without relying on fetch to cancel its body. @internal */
export async function uploadRawMessage(
  config: ResolvedJmapConfig,
  uploadUrl: string,
  accountId: string,
  plan: RawMessagePlan,
  signal?: AbortSignal,
): Promise<BlobUploadResponse> {
  return await rawOperation(config.timeout, async (outerSignal, progress) => {
    const analysis = plan.encoding === undefined
      ? await analyzeRawMessage(plan, outerSignal, progress)
      : { encoding: plan.encoding, size: plan.size };
    outerSignal.throwIfAborted();
    const controller = new AbortController();
    const combined = combineSignals(controller.signal, outerSignal);
    const owned = combined.signal;
    const iterator = iterateRawMessage(plan, {
      signal: owned,
      encoding: analysis.encoding,
      expectedSize: analysis.size,
      onProgress: progress,
    })[Symbol.asyncIterator]();
    let closed = false;
    let eof = false;
    let size = 0;
    let sourceError: unknown;
    let hasSourceError = false;
    let bodyController: ReadableStreamDefaultController<Uint8Array> | undefined;
    const close = (reason?: unknown) => {
      if (closed) return;
      closed = true;
      controller.abort(reason);
      if (!eof) {
        try {
          Promise.resolve(iterator.return?.()).catch(() => {});
        } catch { /* Preserve the original failure. */ }
      }
    };
    const abort = () => {
      try {
        bodyController?.error(owned.reason);
      } catch { /* Already closed. */ }
      close(owned.reason);
    };
    const body = new ReadableStream<Uint8Array>({
      start(stream) {
        bodyController = stream;
        owned.addEventListener("abort", abort, { once: true });
        if (owned.aborted) abort();
      },
      async pull(stream) {
        try {
          owned.throwIfAborted();
          const item = await iterator.next();
          owned.throwIfAborted();
          if (item.done) {
            eof = true;
            progress();
            stream.close();
          } else {
            size += item.value.length;
            stream.enqueue(new Uint8Array(item.value));
          }
        } catch (error) {
          if (!owned.aborted && !hasSourceError) {
            hasSourceError = true;
            sourceError = error;
          }
          try {
            stream.error(error);
          } catch { /* Already closed. */ }
          close(error);
        }
      },
      cancel: close,
    }, { highWaterMark: 0 });
    const headers = new Headers(config.headers);
    if (!headers.has("Authorization")) {
      if (config.bearerToken) {
        headers.set("Authorization", `Bearer ${config.bearerToken}`);
      } else if (config.basicAuth) {
        headers.set(
          "Authorization",
          `Basic ${
            btoa(`${config.basicAuth.username}:${config.basicAuth.password}`)
          }`,
        );
      }
    }
    headers.set("Content-Type", "message/rfc822");
    const request: RequestInit & { duplex: "half" } = {
      method: "POST",
      headers,
      body,
      duplex: "half",
      redirect: "error",
      signal: owned,
    };
    try {
      const response = await fetch(
        uploadUrl.replace("{accountId}", encodeURIComponent(accountId)),
        request,
      );
      owned.throwIfAborted();
      if (!eof) {
        throw new JmapApiError("Raw upload responded before validated EOF.");
      }
      if (!response.ok) {
        throw new JmapApiError(
          `Raw upload failed: ${response.status}`,
          response.status,
          await response.text(),
        );
      }
      const result: unknown = await response.json();
      owned.throwIfAborted();
      if (
        !isRecord(result) || result.accountId !== accountId ||
        typeof result.blobId !== "string" || !result.blobId ||
        result.size !== size
      ) {
        throw new JmapApiError("Invalid raw upload response.");
      }
      return {
        accountId,
        blobId: result.blobId,
        size,
        type: typeof result.type === "string" ? result.type : "message/rfc822",
      };
    } catch (error) {
      outerSignal.throwIfAborted();
      if (hasSourceError) throw sourceError;
      owned.throwIfAborted();
      throw error;
    } finally {
      owned.removeEventListener("abort", abort);
      close();
      combined.cleanup();
    }
  }, signal);
}

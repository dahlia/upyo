import { combineSignals } from "@upyo/core";
import { Buffer } from "node:buffer";
import type { Socket } from "node:net";
import type { Writable } from "node:stream";
import type { SmtpResponse } from "./smtp-connection.ts";

/** Races preparation against source inactivity and remote socket termination. */
export async function prepareOnSocket<T>(
  socket: Socket,
  timeoutMs: number,
  prepare: (signal: AbortSignal, progress: () => void) => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const combined = combineSignals(controller.signal, signal);
  const fail = (error: unknown) => controller.abort(error);
  const closed = () =>
    fail(new TypeError("SMTP connection closed during message preparation."));
  const data = () =>
    fail(new TypeError("Unexpected SMTP reply during message preparation."));
  let timer: ReturnType<typeof setTimeout>;
  const progress = () => {
    clearTimeout(timer);
    timer = setTimeout(
      () => fail(new TypeError("SMTP message preparation timeout.")),
      timeoutMs,
    );
  };
  socket.on("error", fail);
  socket.on("close", closed);
  socket.on("data", data);
  progress();
  try {
    if (socket.destroyed || !socket.writable) closed();
    combined.signal.throwIfAborted();
    return await abortable(prepare(combined.signal, progress), combined.signal);
  } catch (error) {
    const interrupted = combined.signal.aborted;
    controller.abort(error);
    if (interrupted) socket.destroy();
    signal?.throwIfAborted();
    throw error;
  } finally {
    clearTimeout(timer!);
    socket.off("error", fail);
    socket.off("close", closed);
    socket.off("data", data);
    combined.cleanup();
  }
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() =>
      signal.removeEventListener("abort", abort)
    );
    if (signal.aborted) abort();
  });
}

/** Writes one DATA body with bounded transparency buffers and backpressure. */
export async function writeMessageData(
  socket: Writable,
  source: (
    signal: AbortSignal,
    progress: () => void,
  ) => AsyncIterable<Uint8Array>,
  timeoutMs: number,
  checkSize: (size: number) => void,
  signal?: AbortSignal,
): Promise<SmtpResponse> {
  const controller = new AbortController();
  const combined = combineSignals(controller.signal, signal);
  const owned = combined.signal;
  let terminated = false;
  let complete = false;
  let replyBytes = 0;
  let buffer = "";
  const lines: string[] = [];
  let resolveReply!: (reply: SmtpResponse) => void;
  const reply = new Promise<SmtpResponse>((resolve) => resolveReply = resolve);
  const fail = (error: unknown) => {
    if (!owned.aborted) controller.abort(error);
    socket.destroy();
  };
  const close = () =>
    fail(new TypeError("SMTP connection closed during DATA."));
  const onAbort = () => socket.destroy();
  let timer: ReturnType<typeof setTimeout>;
  const progress = () => {
    clearTimeout(timer);
    timer = setTimeout(
      () => fail(new TypeError("SMTP DATA timeout.")),
      timeoutMs,
    );
  };
  const data = (chunk: Uint8Array) => {
    replyBytes += chunk.length;
    if (replyBytes > 65536) {
      fail(new RangeError("SMTP DATA reply exceeds 64 KiB."));
      return;
    }
    buffer += Buffer.from(chunk).toString("utf8");
    let end: number;
    while ((end = buffer.indexOf("\r\n")) >= 0) {
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      lines.push(line);
      if (/^\d{3} /.test(line)) {
        if (!terminated) {
          fail(new TypeError(`Premature SMTP DATA reply: ${line}`));
        } else {
          resolveReply({
            code: Number(line.slice(0, 3)),
            message: line.slice(4),
            raw: lines.join("\r\n"),
          });
        }
        return;
      }
    }
  };
  socket.on("error", fail);
  socket.on("close", close);
  socket.on("data", data);
  owned.addEventListener("abort", onAbort, { once: true });
  progress();
  let iterator: AsyncIterator<Uint8Array> | undefined;
  async function write(bytes: Uint8Array): Promise<void> {
    owned.throwIfAborted();
    await abortable(
      new Promise<void>((resolve, reject) => {
        let written = false;
        let drained = false;
        let returned = false;
        const cleanup = () => {
          socket.off("drain", drain);
          owned.removeEventListener("abort", cleanup);
        };
        const finish = () => {
          if (returned && written && drained) {
            cleanup();
            progress();
            resolve();
          }
        };
        const drain = () => {
          drained = true;
          finish();
        };
        socket.once("drain", drain);
        owned.addEventListener("abort", cleanup, { once: true });
        try {
          const accepted = socket.write(bytes, (error?: Error | null) => {
            if (error != null) {
              cleanup();
              reject(error);
              return;
            }
            written = true;
            finish();
          });
          drained = accepted || drained;
          returned = true;
          finish();
        } catch (error) {
          cleanup();
          reject(error);
        }
      }),
      owned,
    );
  }
  try {
    iterator = source(owned, progress)[Symbol.asyncIterator]();
    if (socket.destroyed || !socket.writable) close();
    let lineStart = true;
    let size = 0;
    while (true) {
      owned.throwIfAborted();
      const item = await abortable(Promise.resolve(iterator.next()), owned);
      if (item.done) break;
      const chunk = item.value;
      for (let offset = 0; offset < chunk.length; offset += 32768) {
        const window = chunk.subarray(offset, offset + 32768);
        size += window.length;
        checkSize(size);
        progress();
        const output = Buffer.allocUnsafe(window.length * 2);
        let length = 0;
        for (const byte of window) {
          if (lineStart && byte === 46) output[length++] = 46;
          output[length++] = byte;
          lineStart = byte === 10;
        }
        await write(output.subarray(0, length));
      }
    }
    owned.throwIfAborted();
    terminated = true;
    await write(Buffer.from(".\r\n"));
    const result = await abortable(reply, owned);
    owned.throwIfAborted();
    complete = true;
    return result;
  } catch (error) {
    fail(error);
    signal?.throwIfAborted();
    throw owned.reason;
  } finally {
    if (!complete) {
      try {
        Promise.resolve(iterator?.return?.()).catch(() => {});
      } catch { /* Preserve the send failure. */ }
    }
    clearTimeout(timer!);
    socket.off("error", fail);
    socket.off("close", close);
    socket.off("data", data);
    owned.removeEventListener("abort", onAbort);
    combined.cleanup();
  }
}

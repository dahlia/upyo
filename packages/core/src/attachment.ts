import { combineSignals } from "./abort-signal.ts";

/**
 * Opens a fresh, independent attachment reader on every invocation. Readers
 * must produce identical bytes for retries, concurrent sends, and DKIM passes.
 * A yielded chunk must remain valid until the next read. Factories should honor
 * the signal during acquisition and release resources when iteration ends.
 * @param signal Cancellation signal owned by the reader.
 * @returns A new iterable, optionally acquired asynchronously.
 * @since 0.6.0
 */
export type AttachmentContentFactory = (
  signal?: AbortSignal,
) => AsyncIterable<Uint8Array> | Promise<AsyncIterable<Uint8Array>>;

/**
 * Replayable attachment bytes. One-shot iterables are intentionally excluded;
 * wrap them in a factory that opens a new reader for each invocation.
 * @since 0.6.0
 */
export type AttachmentContent =
  | Uint8Array
  | Promise<Uint8Array>
  | Blob
  | AttachmentContentFactory;

/**
 * Represents an attachment in an email message.
 */
export interface Attachment {
  /**
   * Whether the attachment is intended to be used for inline images.
   */
  readonly inline: boolean;

  /**
   * The filename of the attachment, which is used for display purposes
   * and may not be the actual name of the file on disk.
   */
  readonly filename: string;

  /**
   * Replayable attachment content. Use {@link readAttachmentContent} to collect
   * bytes or {@link iterateAttachmentContent} to read them incrementally.
   */
  readonly content: AttachmentContent;

  /**
   * The media type of the attachment, which indicates the type of content
   * and how it should be handled by email clients.
   */
  readonly contentType: `${string}/${string}`;

  /**
   * The content ID of the attachment, which is used to reference
   * inline images in HTML emails.
   */
  readonly contentId: string;
}

/**
 * Checks if the provided value is an {@link Attachment} object.
 * @param attachment The value to check.
 * @return `true` if the value is an {@link Attachment}, otherwise `false`.
 */
export function isAttachment(attachment: unknown): attachment is Attachment {
  return (
    typeof attachment === "object" &&
    attachment !== null &&
    "inline" in attachment &&
    "filename" in attachment &&
    "content" in attachment &&
    "contentType" in attachment &&
    "contentId" in attachment &&
    typeof attachment.inline === "boolean" &&
    typeof attachment.filename === "string" &&
    (attachment.content instanceof Uint8Array ||
      typeof attachment.content === "function" ||
      (typeof Blob !== "undefined" && attachment.content instanceof Blob) ||
      (attachment.content instanceof Promise &&
        typeof attachment.content.then === "function")) &&
    typeof attachment.contentType === "string" &&
    typeof attachment.contentId === "string"
  );
}

function waitForContent<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", abort);
    });
    if (signal.aborted) abort();
  });
}

function blobIterator(blob: Blob): AsyncIterator<Uint8Array> {
  const reader = blob.stream().getReader();
  let pending: Promise<ReadableStreamReadResult<Uint8Array>> | undefined;
  let released = false;
  const release = () => {
    if (!released) {
      released = true;
      reader.releaseLock();
    }
  };
  return {
    async next() {
      pending = reader.read();
      const result = await pending;
      if (result.done) release();
      return result.done
        ? { done: true, value: undefined }
        : { done: false, value: result.value };
    },
    async return() {
      try {
        await reader.cancel();
        await pending;
      } finally {
        release();
      }
      return { done: true, value: undefined };
    },
  };
}

/**
 * Reads attachment chunks without prefetching. Early exit or cancellation
 * aborts the source and requests cleanup without waiting for an uncooperative
 * producer. Producers remain responsible for honoring cancellation.
 * @param content Replayable content to read.
 * @param signal Optional cancellation signal.
 * @returns An iterable of byte chunks, valid until the next read.
 * @throws {TypeError} If a source or yielded chunk is invalid.
 * @throws {Error} If reading fails or cancellation is requested.
 * @since 0.6.0
 */
export async function* iterateAttachmentContent(
  content: AttachmentContent,
  signal?: AbortSignal,
): AsyncIterable<Uint8Array> {
  const controller = new AbortController();
  const combined = combineSignals(controller.signal, signal);
  const ownedSignal = combined.signal;
  let iterator: AsyncIterator<Uint8Array> | undefined;
  let returned = false;
  let done = false;
  const close = () => {
    if (iterator == null || returned || done) return;
    returned = true;
    try {
      Promise.resolve(iterator.return?.()).catch(() => {});
    } catch {
      // Cleanup must not replace the original read or cancellation failure.
    }
  };
  const abort = () => close();
  ownedSignal.addEventListener("abort", abort, { once: true });
  try {
    if (content instanceof Promise) content.catch(() => {});
    ownedSignal.throwIfAborted();
    if (content instanceof Uint8Array || content instanceof Promise) {
      const bytes = await waitForContent(Promise.resolve(content), ownedSignal);
      ownedSignal.throwIfAborted();
      if (!(bytes instanceof Uint8Array)) {
        throw new TypeError("Expected attachment bytes to be a Uint8Array.");
      }
      yield bytes;
      done = true;
      return;
    }
    if (typeof Blob !== "undefined" && content instanceof Blob) {
      iterator = blobIterator(content);
    } else if (typeof content === "function") {
      const opening = Promise.resolve(content(ownedSignal)).then((source) => {
        iterator = source[Symbol.asyncIterator]();
        if (ownedSignal.aborted) close();
        return iterator;
      });
      iterator = await waitForContent(opening, ownedSignal);
    } else {
      throw new TypeError("Expected replayable attachment content.");
    }
    let iterations = 0;
    let bytesRead = 0;
    while (true) {
      ownedSignal.throwIfAborted();
      const result = await waitForContent(
        Promise.resolve(iterator.next()),
        ownedSignal,
      );
      ownedSignal.throwIfAborted();
      if (result.done) {
        done = true;
        break;
      }
      if (!(result.value instanceof Uint8Array)) {
        throw new TypeError("Expected an attachment chunk to be a Uint8Array.");
      }
      yield result.value;
      bytesRead += result.value.length;
      if (++iterations >= 256 || bytesRead >= 1024 * 1024) {
        await waitForContent(
          new Promise<void>((resolve) => setTimeout(resolve, 0)),
          ownedSignal,
        );
        iterations = bytesRead = 0;
      }
    }
  } finally {
    if (!done) {
      controller.abort();
      close();
    }
    ownedSignal.removeEventListener("abort", abort);
    combined.cleanup();
  }
}

/**
 * Collects an attachment in memory. Existing arrays retain their identity;
 * streamed chunks are copied before the producer can reuse their storage.
 * @param content Replayable content to collect.
 * @param signal Optional cancellation signal.
 * @returns The complete attachment bytes.
 * @throws {TypeError} If a source or yielded chunk is invalid.
 * @throws {RangeError} If the attachment cannot fit in a byte array.
 * @throws {Error} If reading fails or cancellation is requested.
 * @since 0.6.0
 */
export async function readAttachmentContent(
  content: AttachmentContent,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let length = 0;
  for await (const chunk of iterateAttachmentContent(content, signal)) {
    if (content instanceof Uint8Array || content instanceof Promise) {
      return chunk;
    }
    if (chunk.length === 0) continue;
    chunks.push(new Uint8Array(chunk));
    length += chunk.length;
    if (!Number.isSafeInteger(length)) {
      throw new RangeError("Attachment size exceeds the safe integer range.");
    }
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

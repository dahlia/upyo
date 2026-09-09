import { type EmailAddress, isEmailAddress } from "./address.ts";
import {
  type AttachmentContent,
  iterateAttachmentContent,
} from "./attachment.ts";

/** Replayable, already serialized MIME bytes. @since 0.6.0 */
export type RawMessageContent = AttachmentContent;

/**
 * Transport requirements of serialized bytes, not a request to transcode them.
 * With `8bit`, the caller guarantees ASCII MIME headers, including nested
 * parts. Upyo checks only the top-level headers and does not parse nested MIME.
 * `utf8` permits internationalized headers. Neither permits NUL or binary MIME
 * transfer.
 * @since 0.6.0
 */
export type RawMessageEncoding = "7bit" | "8bit" | "utf8";

/** Delivery addresses independent of the MIME headers. @since 0.6.0 */
export interface RawMessageEnvelope {
  /** Envelope sender, or null for a null reverse-path. */
  readonly from: EmailAddress | null;
  /** Nonempty list of envelope recipients, including any blind copies. */
  readonly to: readonly EmailAddress[];
}

/**
 * An already serialized message. The source must use CRLF, including its final
 * line ending, contain no NUL, and have lines of at most 998 octets. Headers
 * must not be empty; a body is optional. Upyo does not repair or compose MIME.
 * @since 0.6.0
 */
export interface RawMessage {
  /** Explicit delivery addresses; never inferred from message headers. */
  readonly envelope: RawMessageEnvelope;
  /** Fresh, independent readers must reproduce identical bytes on every call. */
  readonly content: RawMessageContent;
  /**
   * With an explicit encoding, delivery reads the source once. Otherwise it
   * reads twice: analysis, then transmission. Any non-ASCII byte conservatively
   * selects `utf8`, even in a body that could be sent using `8bit`.
   */
  readonly encoding?: RawMessageEncoding;
}

/** Invalid raw-message metadata or wire structure. @since 0.6.0 */
export class RawMessageValidationError extends TypeError {
  /** The invalid message field. */
  readonly field: "envelope" | "content" | "encoding";
  /** Zero-based byte offset, when the error refers to content. */
  readonly byteOffset?: number;
  /** One-based line number, when the error refers to content. */
  readonly lineNumber?: number;

  /**
   * Creates a raw-message validation error.
   * @param message Description of the failure.
   * @param field The invalid field.
   * @param byteOffset Optional zero-based content offset.
   * @param lineNumber Optional one-based line number.
   */
  constructor(
    message: string,
    field: "envelope" | "content" | "encoding",
    byteOffset?: number,
    lineNumber?: number,
  ) {
    super(message);
    this.name = "RawMessageValidationError";
    this.field = field;
    this.byteOffset = byteOffset;
    this.lineNumber = lineNumber;
  }
}

/** @internal */
export interface RawMessagePlan extends RawMessage {
  /** Known byte length, excluding protocol framing. */
  readonly size?: number;
}

/**
 * Snapshots metadata and observes promised bytes before any asynchronous work.
 * @param message The raw message to validate.
 * @returns A replayable plan with a copied envelope.
 * @throws {RawMessageValidationError} If metadata or the source kind is invalid.
 * @internal
 */
export function createRawMessagePlan(message: RawMessage): RawMessagePlan {
  const content = message?.content;
  if (content instanceof Promise) content.catch(() => {});
  const envelope = message?.envelope;
  if (
    envelope == null ||
    (envelope.from !== null && !isEmailAddress(envelope.from)) ||
    !Array.isArray(envelope.to) || envelope.to.length === 0 ||
    !Array.from(envelope.to).every(isEmailAddress)
  ) {
    throw new RawMessageValidationError(
      "Invalid raw message envelope.",
      "envelope",
    );
  }
  if (
    message.encoding !== undefined && message.encoding !== "7bit" &&
    message.encoding !== "8bit" && message.encoding !== "utf8"
  ) {
    throw new RawMessageValidationError(
      "Invalid raw message encoding.",
      "encoding",
    );
  }
  if (
    !(content instanceof Uint8Array) && !(content instanceof Promise) &&
    !(typeof Blob !== "undefined" && content instanceof Blob) &&
    typeof content !== "function"
  ) {
    throw new RawMessageValidationError(
      "Expected replayable raw message bytes.",
      "content",
    );
  }
  return {
    envelope: { from: envelope.from, to: [...envelope.to] },
    content,
    encoding: message.encoding,
    size: content instanceof Uint8Array
      ? content.byteLength
      : typeof Blob !== "undefined" && content instanceof Blob
      ? content.size
      : undefined,
  };
}

/** @internal */
export interface RawMessageAnalysis {
  readonly size: number;
  readonly encoding: RawMessageEncoding;
}

/** @internal */
export interface RawMessageReadOptions {
  readonly signal?: AbortSignal;
  readonly expectedSize?: number;
  readonly encoding?: RawMessageEncoding;
  readonly onProgress?: (analysis: RawMessageAnalysis) => void;
}

/**
 * Validates and yields at most 32 KiB per chunk, without prefetching. Chunks
 * remain valid until the next read; HTTP consumers must copy before enqueueing.
 * The source's own errors and cancellation reasons are preserved.
 * @param plan Validated metadata and replayable source.
 * @param options Cancellation, analysis observations, and transmission checks.
 * @returns Original bytes in bounded windows.
 * @throws {RawMessageValidationError} If wire structure or encoding is invalid.
 * @throws {Error} If the source fails or reading is cancelled.
 * @internal
 */
export async function* iterateRawMessage(
  plan: RawMessagePlan,
  options: RawMessageReadOptions = {},
): AsyncIterable<Uint8Array> {
  let offset = 0;
  let line = 1;
  let column = 0;
  let pendingCr = false;
  let headers = true;
  let nonAscii = false;
  let sinceYield = 0;
  const encoding = options.encoding ?? plan.encoding;
  const fail = (
    message: string,
    field: "content" | "encoding" = "content",
  ): never => {
    throw new RawMessageValidationError(message, field, offset, line);
  };
  for await (
    const chunk of iterateAttachmentContent(plan.content, options.signal)
  ) {
    for (let start = 0; start < chunk.length; start += 32768) {
      options.signal?.throwIfAborted();
      const window = chunk.subarray(start, start + 32768);
      for (const byte of window) {
        if (pendingCr) {
          if (byte !== 10) fail("Expected LF after CR.");
          if (line === 1 && column === 0) {
            fail("Raw message headers must not be empty.");
          }
          if (column === 0) headers = false;
          pendingCr = false;
          column = 0;
          line++;
        } else if (byte === 13) {
          pendingCr = true;
        } else if (byte === 10) {
          fail("Raw messages must use CRLF line endings.");
        } else {
          if (byte === 0) fail("Raw messages must not contain NUL.");
          if (++column > 998) {
            fail("Raw message lines must not exceed 998 octets.");
          }
          if (byte > 127) {
            nonAscii = true;
            if (encoding === "7bit" || (encoding === "8bit" && headers)) {
              fail(
                "Raw message bytes exceed the declared encoding.",
                "encoding",
              );
            }
          }
        }
        offset++;
      }
      if (options.expectedSize !== undefined && offset > options.expectedSize) {
        fail("Raw message size changed between reads.");
      }
      options.onProgress?.({
        size: offset,
        encoding: encoding ?? (nonAscii ? "utf8" : "7bit"),
      });
      options.signal?.throwIfAborted();
      yield window;
      options.signal?.throwIfAborted();
      sinceYield += window.length;
      if (sinceYield >= 1024 * 1024) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        options.signal?.throwIfAborted();
        sinceYield = 0;
      }
    }
  }
  options.signal?.throwIfAborted();
  if (offset === 0) fail("Raw message headers must not be empty.");
  if (pendingCr || column !== 0) fail("Raw messages must end with CRLF.");
  if (options.expectedSize !== undefined && offset !== options.expectedSize) {
    fail("Raw message size changed between reads.");
  }
}

/**
 * Analyzes one complete traversal without retaining the message in memory.
 * @param plan Validated metadata and replayable source.
 * @param signal Cancellation signal.
 * @param onProgress Optional incremental observations, also allowed to reject.
 * @returns The byte length and conservative transport encoding.
 * @throws {RawMessageValidationError} If the raw content is invalid.
 * @throws {Error} If the source or progress callback fails, or reading is cancelled.
 * @internal
 */
export async function analyzeRawMessage(
  plan: RawMessagePlan,
  signal?: AbortSignal,
  onProgress?: (analysis: RawMessageAnalysis) => void,
): Promise<RawMessageAnalysis> {
  let result: RawMessageAnalysis = { size: 0, encoding: "7bit" };
  for await (
    const _ of iterateRawMessage(plan, {
      signal,
      onProgress(info) {
        result = info;
        onProgress?.(info);
      },
    })
  ) { /* Validation happens during iteration. */ }
  return result;
}

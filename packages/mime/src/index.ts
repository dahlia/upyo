/** Portable MIME composition and DKIM signing. @module */
import type { Message, RawMessage } from "@upyo/core";
import { createRawMessagePlan } from "@upyo/core/raw-message";
import { combineSignals } from "@upyo/core/abort-signal";
import type { DkimConfig } from "./dkim/types.ts";
import { prepareMimeMessage } from "./message.ts";
import { prepareMimeStream } from "./stream.ts";

export type {
  DkimAlgorithm,
  DkimBodyMode,
  DkimCanonicalization,
  DkimConfig,
  DkimSignature,
  DkimSigningFailureAction,
} from "./dkim/types.ts";
export { MimeAttachmentReplayError } from "./stream.ts";

/** Composition and lifetime options. @since 0.6.0 */
export interface ComposeMessageOptions {
  /** Optional DKIM signing; buffered body mode is the default. */
  readonly dkim?: DkimConfig;
  /** Cancels preparation and every future content reader. */
  readonly signal?: AbortSignal;
}

/** Stable, replayable MIME bytes with a separate delivery envelope. @since 0.6.0 */
export interface ComposedMessage extends RawMessage {
  /** MIME encoding requirement, independent of internationalized envelope addresses. */
  readonly encoding: "7bit" | "utf8";
  /** Opens an independent reader. The signal cancels only this reader. */
  readonly content: (signal?: AbortSignal) => AsyncIterable<Uint8Array>;
}

/**
 * Composes complete MIME bytes without SMTP framing or a Bcc header.
 * Unsigned messages read attachments lazily. DKIM reads the body during
 * preparation; streaming mode reads it again and verifies every replay.
 * Metadata is snapshotted before asynchronous work. Keep attachment bytes
 * immutable and provide independent, identical factory readers.
 * @param message The structured message to serialize.
 * @param options Signing and cancellation options.
 * @returns Replayable bytes accepted by raw-message transports.
 * @throws {RawMessageValidationError} If the derived envelope is invalid.
 * @throws {TypeError} If message metadata or signing configuration is invalid.
 * @throws {RangeError} If a MIME header exceeds the hard line-length limit.
 * @throws {Error} If signing, attachment reading, or cancellation fails.
 * Attachment errors can also occur during later content reads, after partial
 * output. Streaming DKIM changes throw {@link MimeAttachmentReplayError}.
 * @since 0.6.0
 */
export async function composeMessage(
  message: Message,
  options: ComposeMessageOptions = {},
): Promise<ComposedMessage> {
  const { signal } = options;
  // The neutral plan observes promised sources even when envelope validation fails.
  const plan = prepareMimeMessage(message, options.dkim);
  const { envelope } = createRawMessagePlan({
    envelope: {
      from: message.sender.address,
      to: [
        ...message.recipients,
        ...message.ccRecipients,
        ...message.bccRecipients,
      ]
        .map((recipient) => recipient.address),
    },
    content: new Uint8Array(),
  });
  const stream = await prepareMimeStream(plan, { signal });
  signal?.throwIfAborted();
  return {
    envelope,
    encoding: stream.encoding,
    async *content(readerSignal) {
      const owned = new AbortController();
      const lifetime = combineSignals(owned.signal, signal);
      const reader = combineSignals(lifetime.signal, readerSignal);
      try {
        reader.signal.throwIfAborted();
        yield* stream.read(reader.signal);
      } finally {
        owned.abort();
        reader.cleanup();
        lifetime.cleanup();
      }
    },
  };
}

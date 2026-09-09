import {
  MimeAttachmentReplayError,
  prepareMimeStream,
} from "@upyo/mime/internal";
import type { PreparedSmtpMessage } from "./message-converter.ts";

/** A replayable attachment changed between DKIM body reads. @since 0.6.0 */
export class SmtpAttachmentReplayError extends TypeError {
  /** Creates a replay validation failure. */
  constructor() {
    super("Attachment content changed between DKIM body reads.");
    this.name = "SmtpAttachmentReplayError";
  }
}

/** The final bytes and known size of an SMTP DATA transaction. */
export interface MessageStream {
  readonly size: number | undefined;
  readonly encoding?: "7bit" | "8bit" | "utf8";
  read(signal?: AbortSignal, progress?: () => void): AsyncIterable<Uint8Array>;
}

/** Prepares signatures and sizes under the SMTP preparation timeout. */
export async function prepareMessageStream(
  plan: PreparedSmtpMessage,
  checkSize: (size: number) => void,
  progress: () => void,
  signal?: AbortSignal,
): Promise<MessageStream> {
  try {
    const knownSize = await plan.size(signal, checkSize);
    const stream = await prepareMimeStream(plan, {
      knownSize,
      checkSize,
      progress,
      signal,
    });
    return {
      size: stream.size,
      encoding: stream.encoding,
      async *read(signal, progress) {
        try {
          yield* stream.read(signal, progress);
        } catch (error) {
          signal?.throwIfAborted();
          if (error instanceof MimeAttachmentReplayError) {
            throw new SmtpAttachmentReplayError();
          }
          throw error;
        }
      },
    };
  } catch (error) {
    signal?.throwIfAborted();
    if (error instanceof MimeAttachmentReplayError) {
      throw new SmtpAttachmentReplayError();
    }
    throw error;
  }
}

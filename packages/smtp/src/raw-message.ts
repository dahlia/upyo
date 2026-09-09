import {
  analyzeRawMessage,
  iterateRawMessage,
  type RawMessageEncoding,
  type RawMessagePlan,
  readAttachmentContent,
} from "@upyo/core";
import type { ResolvedSmtpDsn } from "./delivery-status.ts";
import type { SmtpEnvelope } from "./message-converter.ts";
import type { MessageStream } from "./message-stream.ts";

/** Missing support for explicitly declared 8-bit MIME bodies. @since 0.6.0 */
export class Smtp8BitMimeUnsupportedError extends TypeError {
  /** Creates an error for a server without 8BITMIME. */
  constructor() {
    super("SMTP server does not support 8BITMIME.");
    this.name = "Smtp8BitMimeUnsupportedError";
  }
}

/** @internal */
export interface RawSmtpMessage {
  readonly rawMessage: RawMessagePlan;
  readonly envelope: SmtpEnvelope;
  readonly requiresSmtpUtf8: boolean;
}

/** @internal */
export function prepareRawSmtpMessage(
  plan: RawMessagePlan,
  dsn?: ResolvedSmtpDsn,
): RawSmtpMessage {
  return {
    rawMessage: plan,
    envelope: { ...plan.envelope, dsn },
    requiresSmtpUtf8: [plan.envelope.from ?? "", ...plan.envelope.to].some(
      (address) =>
        Array.from(address).some((character) => character.charCodeAt(0) > 127),
    ) || plan.encoding === "utf8",
  };
}

/** @internal */
export async function prepareRawSmtpStream(
  source: RawMessagePlan,
  negotiate: (encoding?: RawMessageEncoding) => void,
  checkSize: (size: number) => void,
  progress: () => void,
  signal?: AbortSignal,
): Promise<MessageStream> {
  let plan = source;
  // Resolve promised bytes within the socket preparation timeout and reuse
  // their identity for the transmission pass, without copying or composing.
  if (plan.content instanceof Promise) {
    const content = await readAttachmentContent(plan.content, signal);
    plan = { ...plan, content, size: content.byteLength };
    progress();
  }
  if (plan.size !== undefined) checkSize(plan.size);
  const analysis = plan.encoding === undefined
    ? await analyzeRawMessage(plan, signal, (info) => {
      progress();
      negotiate(info.encoding);
      checkSize(info.size);
    })
    : { size: plan.size, encoding: plan.encoding };
  signal?.throwIfAborted();
  negotiate(analysis.encoding);
  return {
    size: analysis.size,
    read(signal, progress) {
      return iterateRawMessage(plan, {
        signal,
        encoding: analysis.encoding,
        expectedSize: analysis.size,
        onProgress: () => progress?.(),
      });
    },
  };
}

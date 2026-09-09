import { type Message, readAttachmentContent } from "@upyo/core";
import {
  type DkimConfig,
  type PreparedMimeMessage,
  prepareMimeMessage,
  prepareMimeStream,
} from "@upyo/mime/internal";
import type { ResolvedSmtpDsn } from "./delivery-status.ts";
import { type ResolvedSmtpEnvelope, resolveSmtpEnvelope } from "./envelope.ts";

export interface SmtpMessage {
  readonly envelope: SmtpEnvelope;
  readonly raw: string;
  readonly requiresSmtpUtf8?: boolean;
}
export interface SmtpEnvelope {
  readonly from: string | null;
  readonly to: readonly string[];
  readonly dsn?: ResolvedSmtpDsn;
}
/** SMTP envelope and delivery options around a shared MIME plan. */
export interface PreparedSmtpMessage extends PreparedMimeMessage {
  readonly envelope: SmtpEnvelope;
  readonly requiresSmtpUtf8: boolean;
}
/** Snapshots MIME metadata and preserves the effective SMTP envelope. */
export function prepareMessage(
  message: Message,
  dkimConfig?: DkimConfig,
  dsn?: ResolvedSmtpDsn,
  resolvedEnvelope: ResolvedSmtpEnvelope = resolveSmtpEnvelope(message),
): PreparedSmtpMessage {
  const plan = prepareMimeMessage(message, dkimConfig);
  const envelope = { ...resolvedEnvelope, dsn };
  return {
    ...plan,
    envelope,
    requiresSmtpUtf8: plan.encoding === "utf8" ||
      [envelope.from ?? "", ...envelope.to].some((address) =>
        /[\u0080-\uffff]/.test(address)
      ),
  };
}
/** Collects the shared stream using the historical internal trailing-CRLF convention. */
export async function convertMessage(
  message: Message,
  dkimConfig?: DkimConfig,
  dsn?: ResolvedSmtpDsn,
  resolvedEnvelope: ResolvedSmtpEnvelope = resolveSmtpEnvelope(message),
  signal?: AbortSignal,
): Promise<SmtpMessage> {
  const plan = prepareMessage(message, dkimConfig, dsn, resolvedEnvelope);
  const stream = await prepareMimeStream(plan, { signal });
  const bytes = await readAttachmentContent(
    (signal) => stream.read(signal),
    signal,
  );
  return {
    envelope: plan.envelope,
    raw: new TextDecoder().decode(bytes).slice(0, -2),
    requiresSmtpUtf8: plan.requiresSmtpUtf8 || stream.encoding === "utf8",
  };
}

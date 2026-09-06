import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { BodyHasher } from "./dkim/body-hash.ts";
import { signWithBodyHash } from "./dkim/sign.ts";
import type { PreparedSmtpMessage } from "./message-converter.ts";

/**
 * A replayable attachment changed between DKIM body reads.
 * @since 0.6.0
 */
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
  read(signal?: AbortSignal, progress?: () => void): AsyncIterable<Uint8Array>;
}

/** Prepares signatures and sizes without consuming unsigned factory sources. */
export async function prepareMessageStream(
  plan: PreparedSmtpMessage,
  checkSize: (size: number) => void,
  progress: () => void,
  signal?: AbortSignal,
): Promise<MessageStream> {
  const knownSize = await plan.size(signal, checkSize);
  if (knownSize != null) checkSize(knownSize);
  const signatures = plan.dkim?.signatures ?? [];
  if (signatures.length === 0) {
    return {
      size: knownSize,
      async *read(signal, progress) {
        yield Buffer.from(plan.headers);
        yield* plan.body(signal, progress);
      },
    };
  }
  const buffered = plan.dkim?.bodyMode !== "streaming";
  const chunks: Uint8Array[] = [];
  const hashes = new Map<"simple" | "relaxed", BodyHasher>();
  for (const sig of signatures) {
    const mode = sig.canonicalization?.endsWith("/simple")
      ? "simple"
      : "relaxed";
    if (!hashes.has(mode)) hashes.set(mode, new BodyHasher(mode));
  }
  const rawHash = createHash("sha256");
  let length = 0;
  const headerLength = Buffer.byteLength(plan.headers);
  for await (const chunk of plan.body(signal, progress)) {
    length += chunk.length;
    checkSize(headerLength + length);
    if (chunk.length > 0) progress();
    if (buffered) chunks.push(chunk.slice());
    rawHash.update(chunk);
    for (const hash of hashes.values()) hash.update(chunk);
  }
  const expectedDigest = rawHash.digest("hex");
  const bodyHashes = new Map(
    Array.from(hashes, ([mode, hash]) => [mode, hash.digest()]),
  );
  let headers = plan.headers;
  try {
    for (const sig of signatures) {
      const mode = sig.canonicalization?.endsWith("/simple")
        ? "simple"
        : "relaxed";
      const result = await signWithBodyHash(
        headers,
        sig,
        bodyHashes.get(mode)!,
        signal,
      );
      headers = `${result.headerName}: ${result.signature}\r\n${headers}`;
    }
  } catch (error) {
    signal?.throwIfAborted();
    if (plan.dkim?.onSigningFailure !== "send-unsigned") throw error;
    console.warn("DKIM signing failed, sending unsigned:", error);
  }
  const size = Buffer.byteLength(headers) + length;
  checkSize(size);
  return {
    size,
    async *read(signal, progress) {
      yield Buffer.from(headers);
      if (buffered) {
        for (const chunk of chunks) {
          signal?.throwIfAborted();
          yield chunk;
        }
        return;
      }
      const replayHash = createHash("sha256");
      let replayLength = 0;
      for await (const chunk of plan.body(signal, progress)) {
        replayLength += chunk.length;
        if (replayLength > length) throw new SmtpAttachmentReplayError();
        replayHash.update(chunk);
        yield chunk;
      }
      if (
        replayLength !== length || replayHash.digest("hex") !== expectedDigest
      ) {
        throw new SmtpAttachmentReplayError();
      }
    },
  };
}

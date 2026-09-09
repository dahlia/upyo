import { sha256 } from "@noble/hashes/sha2";
import { RawMessageValidationError } from "@upyo/core";
import { base64, utf8 } from "./bytes.ts";
import { BodyHasher } from "./dkim/body-hash.ts";
import { signWithBodyHash } from "./dkim/sign.ts";
import type { PreparedMimeMessage } from "./message.ts";

/**
 * A replayable attachment changed between DKIM body reads.
 * @since 0.6.0
 */
export class MimeAttachmentReplayError extends RawMessageValidationError {
  /** Creates a replay validation failure. */
  constructor() {
    super("Attachment content changed between DKIM body reads.", "content");
    this.name = "MimeAttachmentReplayError";
  }
}

/** The final bytes and known size of an SMTP DATA transaction. */
export interface MimeStream {
  readonly encoding: "7bit" | "utf8";
  readonly size: number | undefined;
  read(signal?: AbortSignal, progress?: () => void): AsyncIterable<Uint8Array>;
}

/** Options for preparing a shared MIME stream. @internal */
export interface PrepareMimeStreamOptions {
  readonly knownSize?: number;
  readonly checkSize?: (size: number) => void;
  readonly progress?: () => void;
  readonly signal?: AbortSignal;
}

/** Prepares signatures without speculative unsigned attachment reads. @internal */
export async function prepareMimeStream(
  plan: PreparedMimeMessage,
  options: PrepareMimeStreamOptions = {},
): Promise<MimeStream> {
  const { knownSize, signal } = options;
  signal?.throwIfAborted();
  const progress = options.progress ?? (() => {});
  const checkSize = (size: number) => {
    if (!Number.isSafeInteger(size)) {
      throw new RangeError("Message size exceeds the safe integer range.");
    }
    options.checkSize?.(size);
  };
  if (knownSize != null) checkSize(knownSize);
  const signatures = plan.dkim?.signatures ?? [];
  if (signatures.length === 0) {
    return {
      size: knownSize,
      encoding: plan.encoding,
      async *read(signal, progress) {
        signal?.throwIfAborted();
        yield utf8(plan.headers);
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
  const rawHash = sha256.create();
  let length = 0;
  const headerLength = utf8(plan.headers).length;
  for await (const chunk of plan.body(signal, progress)) {
    length += chunk.length;
    checkSize(headerLength + length);
    if (chunk.length > 0) progress();
    if (buffered) chunks.push(chunk.slice());
    rawHash.update(chunk);
    for (const hash of hashes.values()) hash.update(chunk);
  }
  const expectedDigest = base64(rawHash.digest());
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
  signal?.throwIfAborted();
  if (headers.split("\r\n").some((line) => utf8(line).length > 998)) {
    throw new RangeError("Signed MIME header exceeds the RFC 5322 line limit.");
  }
  const size = utf8(headers).length + length;
  checkSize(size);
  return {
    size,
    encoding: plan.encoding === "utf8" || /[\u0080-\uffff]/.test(headers)
      ? "utf8"
      : "7bit",
    async *read(signal, progress) {
      signal?.throwIfAborted();
      yield utf8(headers);
      if (buffered) {
        for (const chunk of chunks) {
          signal?.throwIfAborted();
          yield chunk.slice();
        }
        return;
      }
      const replayHash = sha256.create();
      let replayLength = 0;
      for await (const chunk of plan.body(signal, progress)) {
        replayLength += chunk.length;
        if (replayLength > length) throw new MimeAttachmentReplayError();
        replayHash.update(chunk);
        yield chunk;
      }
      if (
        replayLength !== length ||
        base64(replayHash.digest()) !== expectedDigest
      ) {
        throw new MimeAttachmentReplayError();
      }
    },
  };
}

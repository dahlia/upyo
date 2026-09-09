import { type AttachmentContent, iterateAttachmentContent } from "@upyo/core";
import { base64, utf8 } from "./bytes.ts";

/** Encodes base64 without retaining producer-owned carry bytes. */
export async function* encodeAttachment(
  content: AttachmentContent,
  signal?: AbortSignal,
  progress?: () => void,
): AsyncIterable<Uint8Array> {
  const carry = new Uint8Array(3);
  let carried = 0;
  let column = 0;
  function wrap(encoded: string): Uint8Array {
    const parts: string[] = [];
    let offset = 0;
    while (offset < encoded.length) {
      if (column === 76) {
        parts.push("\r\n");
        column = 0;
      }
      const take = Math.min(76 - column, encoded.length - offset);
      parts.push(encoded.slice(offset, offset + take));
      offset += take;
      column += take;
    }
    return utf8(parts.join(""));
  }
  let processed = 0;
  for await (const chunk of iterateAttachmentContent(content, signal)) {
    if (chunk.length > 0) progress?.();
    let offset = 0;
    if (carried > 0) {
      while (carried < 3 && offset < chunk.length) {
        carry[carried++] = chunk[offset++];
      }
      if (carried === 3) {
        yield wrap(base64(carry));
        carried = 0;
      }
    }
    while (offset + 3 <= chunk.length) {
      signal?.throwIfAborted();
      const length = Math.min(
        45 * 1024,
        Math.floor((chunk.length - offset) / 3) * 3,
      );
      yield wrap(
        base64(chunk.subarray(offset, offset + length)),
      );
      offset += length;
      processed += length;
      if (processed >= 1024 * 1024) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        processed = 0;
      }
    }
    while (offset < chunk.length) carry[carried++] = chunk[offset++];
  }
  if (carried > 0) {
    yield wrap(base64(carry.subarray(0, carried)));
  }
}

/** Encoded payload length, excluding MIME framing and a trailing CRLF. */
export function attachmentEncodedSize(length: number): number {
  const encoded = 4 * Math.ceil(length / 3);
  return encoded + (encoded === 0 ? 0 : 2 * Math.floor((encoded - 1) / 76));
}

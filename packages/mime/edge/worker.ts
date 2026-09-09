import { composeMessage } from "../dist/index.js";
import { createMessage, readAttachmentContent } from "@upyo/core";
import {
  TEST_DKIM_ED25519_PRIVATE_KEY,
  TEST_DKIM_PRIVATE_KEY,
} from "../src/test-utils/dkim-test-keys.ts";

export default {
  async fetch(): Promise<Response> {
    if (
      typeof globalThis.Buffer !== "undefined" ||
      typeof globalThis.process !== "undefined"
    ) {
      throw new TypeError("Unexpected Node compatibility globals.");
    }
    const message = createMessage({
      from: "sender@example.com",
      to: "recipient@example.com",
      bcc: "hidden@example.com",
      subject: "Edge 한글",
      content: { text: "First\r\nSecond", html: "<b>한글</b>" },
      calendar: {
        method: "REQUEST",
        content:
          "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Upyo//EN\r\nMETHOD:REQUEST\r\nEND:VCALENDAR\r\n",
      },
      attachments: [
        {
          filename: "blob.txt",
          contentId: "blob",
          inline: false,
          contentType: "text/plain",
          content: new Blob(["blob content"]),
        },
        {
          filename: "large.bin",
          contentId: "large",
          inline: false,
          contentType: "application/octet-stream",
          content: async function* () {
            for (let i = 0; i < 64; i++) yield new Uint8Array(32768).fill(i);
          },
        },
      ],
    });
    const raw = await composeMessage(message);
    let size = 0;
    let maxChunk = 0;
    for await (const chunk of raw.content()) {
      size += chunk.length;
      maxChunk = Math.max(maxChunk, chunk.length);
    }
    const controller = new AbortController();
    const iterator = raw.content(controller.signal)[Symbol.asyncIterator]();
    await iterator.next();
    controller.abort("stop");
    let cancelled = false;
    try {
      await iterator.next();
    } catch (error) {
      cancelled = error === "stop";
    }
    const first = new TextDecoder().decode(
      (await raw.content()[Symbol.asyncIterator]().next()).value,
    );
    const other = await composeMessage(message);
    const second = new TextDecoder().decode(
      (await other.content()[Symbol.asyncIterator]().next()).value,
    );
    const signatures: { algorithm: string; bodyMode: string; wire: string }[] =
      [];
    for (const algorithm of ["rsa-sha256", "ed25519-sha256"] as const) {
      for (const bodyMode of ["buffered", "streaming"] as const) {
        const signed = await composeMessage({
          ...message,
          attachments: message.attachments.slice(0, 1),
        }, {
          dkim: {
            bodyMode,
            signatures: [{
              algorithm,
              signingDomain: "example.com",
              selector: "edge",
              privateKey: algorithm === "rsa-sha256"
                ? TEST_DKIM_PRIVATE_KEY
                : TEST_DKIM_ED25519_PRIVATE_KEY,
            }],
          },
        });
        signatures.push({
          algorithm,
          bodyMode,
          wire: new TextDecoder().decode(
            await readAttachmentContent(signed.content),
          ),
        });
      }
    }
    return Response.json({
      size,
      maxChunk,
      cancelled,
      unique: first !== second,
      signatures,
    });
  },
};

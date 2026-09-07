import assert from "node:assert/strict";
import { test } from "node:test";
import { Buffer } from "node:buffer";
import { createMessage } from "@upyo/core";
import { prepareMessage } from "./message-converter.ts";

for (const length of [0, 1, 2, 3, 56, 57, 58, 114, 65537, 256 * 1024]) {
  test(`streams and sizes ${length} attachment bytes`, async () => {
    const bytes = Uint8Array.from({ length }, (_, i) => i % 251);
    let opened = 0;
    const message = createMessage({
      from: "from@example.com",
      to: "to@example.com",
      subject: "Test",
      content: { text: "Test" },
      attachments: {
        filename: "data.bin",
        contentType: "application/octet-stream",
        inline: false,
        contentId: "data",
        content: bytes,
      },
    });
    const plan = prepareMessage(message);
    const expectedSize = await plan.size();
    const chunks: Uint8Array[] = [];
    for await (const chunk of plan.body()) {
      assert.ok(chunk.length <= 65536);
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks).toString();
    assert.equal(
      Buffer.byteLength(plan.headers) + Buffer.byteLength(body),
      expectedSize,
    );
    const payload = body.split("Content-Transfer-Encoding: base64\r\n")[1]
      .split("\r\n\r\n")[1].split("\r\n--")[0];
    assert.equal(
      payload,
      Buffer.from(bytes).toString("base64").replace(/(.{76})(?=.)/g, "$1\r\n"),
    );
    const streamed = prepareMessage({
      ...message,
      attachments: [{
        ...message.attachments[0],
        content: async function* () {
          opened++;
          for (let i = 0; i < bytes.length; i += 37) {
            yield bytes.subarray(i, i + 37);
          }
        },
      }],
    });
    assert.equal(await streamed.size(), undefined);
    assert.equal(opened, 0);
    const parts: Uint8Array[] = [];
    for await (const chunk of streamed.body()) parts.push(chunk);
    const streamedPayload = Buffer.concat(parts).toString()
      .split("Content-Transfer-Encoding: base64\r\n")[1]
      .split("\r\n\r\n")[1].split("\r\n--")[0];
    assert.equal(streamedPayload, payload);
    assert.equal(opened, 1);
  });
}

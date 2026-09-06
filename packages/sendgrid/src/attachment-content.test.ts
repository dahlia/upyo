import assert from "node:assert/strict";
import { test } from "node:test";
import { createMessage } from "@upyo/core";
import { createSendGridConfig } from "./config.ts";
import { convertMessage } from "./message-converter.ts";

test("closes sibling sources when one attachment conversion fails", async () => {
  let siblingSignal: AbortSignal | undefined;
  const failure = new TypeError("Read failed.");
  const attachment = {
    filename: "a",
    contentId: "a",
    inline: false,
    contentType: "application/octet-stream" as const,
  };
  const mail = createMessage({
    from: "from@example.com",
    to: "to@example.com",
    subject: "Test",
    content: { text: "Test" },
    attachments: [{
      ...attachment,
      content: async function* () {
        yield new Uint8Array([1]);
        throw failure;
      },
    }, {
      ...attachment,
      content: (signal) => {
        siblingSignal = signal;
        return {
          [Symbol.asyncIterator]() {
            return { next: () => new Promise(() => {}) };
          },
        };
      },
    }],
  });
  await assert.rejects(
    convertMessage(mail, createSendGridConfig({ apiKey: "SG.test" })),
    (error) => error === failure,
  );
  assert.ok(siblingSignal?.aborted);
});

test("collects large replayable attachments without argument overflow", async () => {
  const bytes = new Uint8Array(256 * 1024).fill(123);
  const config = createSendGridConfig({ apiKey: "SG.test" });
  for (
    const content of [new Blob([bytes]), async function* () {
      yield bytes;
    }]
  ) {
    const result = await convertMessage(
      createMessage({
        from: "from@example.com",
        to: "to@example.com",
        subject: "Test",
        content: { text: "Test" },
        attachments: {
          inline: false,
          filename: "large.bin",
          content,
          contentId: "large",
          contentType: "application/octet-stream",
        },
      }),
      config,
    );
    const encoded = result.attachments?.[0].content;
    assert.ok(encoded);
    assert.deepEqual(
      Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0)),
      bytes,
    );
  }
});

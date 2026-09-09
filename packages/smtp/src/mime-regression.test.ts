import assert from "node:assert/strict";
import { test } from "node:test";
import { createMessage } from "@upyo/core";
import { convertMessage } from "./message-converter.ts";

for (
  const text of [
    "first\r\nsecond",
    "a".repeat(150),
    ("x".repeat(60) + "\n").repeat(20),
  ]
) {
  test(`quoted-printable physical lines: ${JSON.stringify(text.slice(0, 20))}`, async () => {
    const { raw } = await convertMessage(createMessage({
      from: "from@example.com",
      to: "to@example.com",
      subject: "Test",
      content: { text },
    }));
    const body = raw.split("\r\n\r\n")[1];
    assert.ok(!/(?<!\r)\n/.test(body));
    assert.ok(body.split("\r\n").every((line) => line.length <= 76));
    const decoded = body.replace(/=\r\n/g, "").replace(
      /=([0-9A-F]{2})/g,
      (_, hex) => String.fromCharCode(parseInt(hex, 16)),
    );
    assert.equal(decoded, text);
  });
}

test("reject an unfoldable inline Content-ID", async () => {
  await assert.rejects(
    convertMessage(createMessage({
      from: "from@example.com",
      to: "to@example.com",
      subject: "Test",
      content: { text: "Test" },
      attachments: {
        filename: "a",
        contentType: "text/plain",
        content: new Uint8Array(),
        inline: true,
        contentId: "x".repeat(1000),
      },
    })),
    RangeError,
  );
});

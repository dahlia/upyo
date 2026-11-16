import assert from "node:assert/strict";
import { test } from "node:test";
import { createMessage, readAttachmentContent } from "@upyo/core";
import { composeMessage } from "./index.ts";

test("composeMessage quotes display names without changing the envelope", async () => {
  const cases = [
    ["Doe, John", '"Doe, John"'],
    ["a:b", '"a:b"'],
    ['a"b', '"a\\"b"'],
    ["a\\b", '"a\\\\b"'],
    ["", '""'],
    [" lead", '" lead"'],
    ["trail ", '"trail "'],
    ["a  b", '"a  b"'],
    ["John Q. Public", '"John Q. Public"'],
    ["John Doe", "John Doe"],
  ];
  for (const [name, expected] of cases) {
    const address = { name, address: "a@example.com" } as const;
    const raw = await composeMessage(
      createMessage({
        from: address,
        to: address,
        cc: address,
        replyTo: address,
        bcc: "blind@example.com",
        subject: "Display name",
        content: { text: "Hello" },
      }),
    );
    const wire = new TextDecoder().decode(
      await readAttachmentContent(raw.content),
    );
    for (const field of ["From", "To", "Cc", "Reply-To"]) {
      assert.ok(
        wire.split("\r\n").includes(`${field}: ${expected} <a@example.com>`),
        `${field}: ${name}`,
      );
    }
    assert.equal(raw.envelope.from, "a@example.com");
    assert.deepEqual(raw.envelope.to, [
      "a@example.com",
      "a@example.com",
      "blind@example.com",
    ]);
    assert.ok(!wire.includes("Bcc:"));
  }
});

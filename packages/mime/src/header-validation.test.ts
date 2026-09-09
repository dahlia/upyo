import assert from "node:assert/strict";
import { test } from "node:test";
import { createMessage } from "@upyo/core";
import { composeMessage } from "./index.ts";
import { prepareMimeMessage } from "./internal.ts";

const message = createMessage({
  from: "from@example.com",
  to: "to@example.com",
  subject: "Test",
  content: { text: "Hello" },
});

for (
  const address of [
    "reply@example.com\r\nBcc: injected@example.com",
    "reply@example.com\r",
    "reply@example.com\n",
  ]
) {
  test(`reject address line endings: ${JSON.stringify(address)}`, async () => {
    const direct = {
      ...message,
      replyRecipients: [{ address: address as `${string}@${string}` }],
    };
    assert.throws(() => prepareMimeMessage(direct), TypeError);
    await assert.rejects(composeMessage(direct), TypeError);
  });
}

class DirectHeaders extends Headers {
  constructor(private readonly field: string) {
    super();
  }
  override *[Symbol.iterator](): Generator<[string, string], void, unknown> {
    yield [this.field, "value"];
  }
}

for (
  const field of [
    "X-Test\r\nBcc",
    "X-Test: Bcc",
    "X Test",
    "",
    "X-한글",
    "X-Test\n",
  ]
) {
  test(`reject invalid custom field name: ${JSON.stringify(field)}`, async () => {
    const direct = { ...message, headers: new DirectHeaders(field) };
    assert.throws(() => prepareMimeMessage(direct), TypeError);
    await assert.rejects(composeMessage(direct), TypeError);
  });
}

test("accept the full printable ASCII field-name range except colon", async () => {
  const field = Array.from(
    { length: 94 },
    (_, index) => String.fromCharCode(index + 33),
  ).join("").replace(":", "");
  await composeMessage({ ...message, headers: new DirectHeaders(field) });
});

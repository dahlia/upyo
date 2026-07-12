import type { Receipt } from "@upyo/core";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MailtrapTransport } from "./mailtrap-transport.ts";
import {
  createTestMessage,
  getTestConfig,
  isE2eTestingEnabled,
} from "./test-utils/test-config.ts";

const describeE2E = isE2eTestingEnabled() ? describe : describe.skip;

describeE2E("MailtrapTransport E2E", { concurrency: false }, () => {
  async function waitForRateLimit(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  function assertSuccessfulReceipt(
    receipt: Receipt,
  ): asserts receipt is Receipt & {
    readonly successful: true;
    readonly messageId: string;
  } {
    assert.equal(
      receipt.successful,
      true,
      receipt.successful ? undefined : receipt.errorMessages.join(", "),
    );
    assert.ok(receipt.messageId);
  }

  it("sends a simple text email to sandbox", async () => {
    await waitForRateLimit();

    const transport = new MailtrapTransport(getTestConfig().mailtrap);
    const receipt = await transport.send(createTestMessage({
      subject: "[E2E] Mailtrap text email",
      content: { text: "This is a Mailtrap E2E test email." },
    }));

    assertSuccessfulReceipt(receipt);
    console.log(`Sent Mailtrap text email with ID: ${receipt.messageId}`);
  });

  it("sends an HTML email to sandbox", async () => {
    await waitForRateLimit();

    const transport = new MailtrapTransport(getTestConfig().mailtrap);
    const receipt = await transport.send(createTestMessage({
      subject: "[E2E] Mailtrap HTML email",
      content: {
        html: "<h1>Hello from Upyo</h1><p>This is a Mailtrap test.</p>",
        text: "Hello from Upyo\n\nThis is a Mailtrap test.",
      },
    }));

    assertSuccessfulReceipt(receipt);
    console.log(`Sent Mailtrap HTML email with ID: ${receipt.messageId}`);
  });

  it("sends multiple emails via batch API", async () => {
    await waitForRateLimit();

    const transport = new MailtrapTransport(getTestConfig().mailtrap);
    const receipts = [];

    for await (
      const receipt of transport.sendMany([
        createTestMessage({
          subject: "[E2E] Mailtrap batch 1",
          content: { text: "Batch message 1" },
        }),
        createTestMessage({
          subject: "[E2E] Mailtrap batch 2",
          content: { text: "Batch message 2" },
        }),
      ])
    ) {
      receipts.push(receipt);
    }

    assert.equal(receipts.length, 2);
    for (const receipt of receipts) {
      assertSuccessfulReceipt(receipt);
    }
  });
});

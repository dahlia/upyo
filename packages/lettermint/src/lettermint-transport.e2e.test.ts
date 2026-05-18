import type { Receipt } from "@upyo/core";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LettermintTransport } from "./lettermint-transport.ts";
import {
  createTestMessage,
  getTestConfig,
  isE2eTestingEnabled,
} from "./test-utils/test-config.ts";

const describeE2E = isE2eTestingEnabled() ? describe : describe.skip;

describeE2E("LettermintTransport E2E", { concurrency: false }, () => {
  async function waitForRateLimit(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 1000));
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

  it("sends a simple text email", async () => {
    await waitForRateLimit();

    const transport = new LettermintTransport(getTestConfig().lettermint);
    const receipt = await transport.send(createTestMessage({
      subject: "[E2E] Lettermint text email",
      content: { text: "This is a Lettermint E2E test email." },
    }));

    assertSuccessfulReceipt(receipt);
    console.log(`Sent Lettermint text email with ID: ${receipt.messageId}`);
  });

  it("sends an HTML email", async () => {
    await waitForRateLimit();

    const transport = new LettermintTransport(getTestConfig().lettermint);
    const receipt = await transport.send(createTestMessage({
      subject: "[E2E] Lettermint HTML email",
      content: {
        html: "<h1>Hello from Upyo</h1><p>This is a Lettermint test.</p>",
        text: "Hello from Upyo\n\nThis is a Lettermint test.",
      },
    }));

    assertSuccessfulReceipt(receipt);
    console.log(`Sent Lettermint HTML email with ID: ${receipt.messageId}`);
  });

  it("sends an email with an attachment", async () => {
    await waitForRateLimit();

    const transport = new LettermintTransport(getTestConfig().lettermint);
    const receipt = await transport.send(createTestMessage({
      subject: "[E2E] Lettermint attachment email",
      content: { text: "This Lettermint E2E test email has an attachment." },
      attachments: [
        {
          filename: "lettermint-e2e.txt",
          contentType: "text/plain",
          content: new TextEncoder().encode(
            "This attachment was sent by the Upyo Lettermint E2E test.",
          ),
          inline: false,
          contentId: "",
        },
      ],
    }));

    assertSuccessfulReceipt(receipt);
    console.log(
      `Sent Lettermint attachment email with ID: ${receipt.messageId}`,
    );
  });

  it("sends multiple emails with sendMany", async () => {
    await waitForRateLimit();

    const transport = new LettermintTransport(getTestConfig().lettermint);
    const receipts: Receipt[] = [];

    for await (
      const receipt of transport.sendMany([
        createTestMessage({
          subject: "[E2E] Lettermint batch email 1",
        }),
        createTestMessage({
          subject: "[E2E] Lettermint batch email 2",
        }),
      ])
    ) {
      receipts.push(receipt);
    }

    assert.equal(receipts.length, 2);
    for (const receipt of receipts) {
      assertSuccessfulReceipt(receipt);
    }
    console.log(
      `Sent Lettermint batch emails with IDs: ${
        receipts.map((receipt) =>
          receipt.successful ? receipt.messageId : "failed"
        ).join(", ")
      }`,
    );
  });
});

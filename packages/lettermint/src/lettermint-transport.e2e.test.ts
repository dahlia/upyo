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

describeE2E("LettermintTransport E2E", () => {
  it("sends a simple text email", async () => {
    const transport = new LettermintTransport(getTestConfig().lettermint);
    const receipt = await transport.send(createTestMessage({
      subject: "[E2E] Lettermint text email",
      content: { text: "This is a Lettermint E2E test email." },
    }));

    assert.equal(receipt.successful, true);
    if (receipt.successful) {
      assert.ok(receipt.messageId);
    }
  });

  it("sends an HTML email", async () => {
    const transport = new LettermintTransport(getTestConfig().lettermint);
    const receipt = await transport.send(createTestMessage({
      subject: "[E2E] Lettermint HTML email",
      content: {
        html: "<h1>Hello from Upyo</h1><p>This is a Lettermint test.</p>",
        text: "Hello from Upyo\n\nThis is a Lettermint test.",
      },
    }));

    assert.equal(receipt.successful, true);
    if (receipt.successful) {
      assert.ok(receipt.messageId);
    }
  });

  it("sends multiple emails with sendMany", async () => {
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
    assert.ok(receipts.every((receipt) => receipt.successful));
  });
});

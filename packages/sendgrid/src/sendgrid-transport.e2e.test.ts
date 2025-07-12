import type { Receipt } from "@upyo/core";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SendGridTransport } from "./sendgrid-transport.ts";
import {
  createTestMessage,
  getTestConfig,
  isE2eTestingEnabled,
} from "./test-utils/test-config.ts";

// Only run E2E tests if environment is configured
const describeE2E = isE2eTestingEnabled() ? describe : describe.skip;

describeE2E("SendGridTransport E2E", () => {
  let transport: SendGridTransport;

  it("should initialize transport with test config", () => {
    const config = getTestConfig();
    transport = new SendGridTransport(config.sendgrid);
    assert.ok(transport);
  });

  it("should send a simple text email", async () => {
    const message = createTestMessage({
      subject: "[E2E] Simple text email",
      content: { text: "This is a test email sent via SendGrid API" },
    });

    const receipt = await transport.send(message);

    assert.equal(receipt.successful, true, "Send should be successful");
    if (receipt.successful) {
      assert.ok(receipt.messageId, "Should have a message ID");
    }

    if (receipt.successful) {
      console.log(`Sent email with ID: ${receipt.messageId}`);
    }
  });

  it("should send an HTML email", async () => {
    const message = createTestMessage({
      subject: "[E2E] HTML email",
      content: {
        text: "This is the plain text version.",
        html:
          "<h1>HTML Email</h1><p>This is a <strong>test email</strong> sent via SendGrid API.</p>",
      },
    });

    const receipt = await transport.send(message);

    assert.equal(receipt.successful, true, "Send should be successful");
    if (receipt.successful) {
      assert.ok(receipt.messageId, "Should have a message ID");
    }

    if (receipt.successful) {
      console.log(`Sent HTML email with ID: ${receipt.messageId}`);
    }
  });

  it("should send an email with attachments", async () => {
    const textContent = new TextEncoder().encode("Hello from attachment!");

    const message = createTestMessage({
      subject: "[E2E] Email with attachment",
      content: { text: "This email has an attachment." },
      attachments: [
        {
          filename: "test.txt",
          contentType: "text/plain",
          content: Promise.resolve(textContent),
          inline: false,
          contentId: "",
        },
      ],
    });

    const receipt = await transport.send(message);

    assert.equal(receipt.successful, true, "Send should be successful");
    if (receipt.successful) {
      assert.ok(receipt.messageId, "Should have a message ID");
    }

    if (receipt.successful) {
      console.log(`Sent email with attachment, ID: ${receipt.messageId}`);
    }
  });

  it("should send an email with high priority", async () => {
    const message = createTestMessage({
      subject: "[E2E] High priority email",
      content: { text: "This is a high priority email." },
      priority: "high",
    });

    const receipt = await transport.send(message);

    assert.equal(receipt.successful, true, "Send should be successful");
    if (receipt.successful) {
      assert.ok(receipt.messageId, "Should have a message ID");
    }

    if (receipt.successful) {
      console.log(`Sent high priority email with ID: ${receipt.messageId}`);
    }
  });

  it("should send an email with custom headers and tags", async () => {
    const headers = new Headers();
    headers.set("X-Test-Campaign", "sendgrid-e2e");
    headers.set("X-Test-ID", `test-${Date.now()}`);

    const message = createTestMessage({
      subject: "[E2E] Email with custom headers and tags",
      content: { text: "This email has custom headers and tags." },
      headers,
      tags: ["e2e-test", "custom-headers", "sendgrid"],
    });

    const receipt = await transport.send(message);

    assert.equal(receipt.successful, true, "Send should be successful");
    if (receipt.successful) {
      assert.ok(receipt.messageId, "Should have a message ID");
    }

    if (receipt.successful) {
      console.log(
        `Sent email with custom headers/tags, ID: ${receipt.messageId}`,
      );
    }
  });

  it("should send multiple emails via sendMany", async () => {
    const messages = [
      createTestMessage({
        subject: "[E2E] Batch email 1",
        content: { text: "This is the first email in the batch." },
      }),
      createTestMessage({
        subject: "[E2E] Batch email 2",
        content: { text: "This is the second email in the batch." },
      }),
      createTestMessage({
        subject: "[E2E] Batch email 3",
        content: { text: "This is the third email in the batch." },
      }),
    ];

    const receipts: Receipt[] = [];
    for await (const receipt of transport.sendMany(messages)) {
      receipts.push(receipt);
    }

    assert.equal(receipts.length, 3);

    for (let i = 0; i < receipts.length; i++) {
      const receipt = receipts[i];
      assert.equal(
        receipt.successful,
        true,
        `Batch email ${i + 1} should be successful`,
      );

      if (receipt.successful) {
        assert.ok(
          receipt.messageId,
          `Batch email ${i + 1} should have a message ID`,
        );

        console.log(
          `Sent batch email ${i + 1} with ID: ${receipt.messageId}`,
        );
      }
    }
  });

  it("should handle send timeout with AbortSignal", async () => {
    const message = createTestMessage({
      subject: "[E2E] Timeout test",
      content: { text: "This test should timeout." },
    });

    const controller = new AbortController();

    // Abort immediately to test signal handling
    setTimeout(() => controller.abort(), 1);

    try {
      await transport.send(message, { signal: controller.signal });
      assert.fail("Should have been aborted");
    } catch (error) {
      assert.ok(error instanceof Error);
      // The error could be AbortError or a general error depending on timing
      assert.ok(
        error.name === "AbortError" ||
          error.message.includes("aborted") ||
          error.message.includes("abort"),
        `Expected abort-related error, got: ${error.message}`,
      );
    }
  });
});

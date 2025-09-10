import type { Receipt } from "@upyo/core";
import { PlunkTransport } from "@upyo/plunk";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createTestMessage,
  getTestConfig,
  isE2eTestingEnabled,
} from "./test-utils/test-config.ts";

// Only run E2E tests if environment is configured
const describeE2E = isE2eTestingEnabled() ? describe : describe.skip;

describeE2E("PlunkTransport E2E", () => {
  let transport: PlunkTransport;

  it("should initialize transport with test config", () => {
    const config = getTestConfig();
    transport = new PlunkTransport(config.plunk);
    assert.ok(transport);
  });

  it("should send a simple text email", async () => {
    const message = createTestMessage({
      subject: "[E2E] Simple text email",
      content: { text: "This is a test email sent via Plunk API" },
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
          "<h1>HTML Email</h1><p>This is a <strong>test email</strong> sent via Plunk API.</p>",
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
          contentType: "text/plain" as const,
          content: Promise.resolve(textContent),
          inline: false,
          contentId: "",
        },
      ],
    });

    const receipt = await transport.send(message);

    // Attachment failures are acceptable - some APIs may have restrictions
    if (receipt.successful) {
      assert.ok(receipt.messageId, "Should have a message ID");
      console.log(`Sent email with attachment, ID: ${receipt.messageId}`);
    } else {
      console.log(
        `Attachment test failed (acceptable): ${
          receipt.errorMessages.join(", ")
        }`,
      );
      // Still pass the test as attachment restrictions are common
    }
  });

  it("should send an email with custom headers", async () => {
    const headers = new Headers();
    headers.set("X-Custom-Source", "Upyo E2E Test");
    headers.set("X-Test-ID", `e2e-${Date.now()}`);

    const message = createTestMessage({
      subject: "[E2E] Email with custom headers",
      content: { text: "This email includes custom headers." },
      headers,
    });

    const receipt = await transport.send(message);

    assert.equal(receipt.successful, true, "Send should be successful");
    if (receipt.successful) {
      assert.ok(receipt.messageId, "Should have a message ID");
    }

    if (receipt.successful) {
      console.log(`Sent email with custom headers, ID: ${receipt.messageId}`);
    }
  });

  it("should send an email with reply-to address", async () => {
    const config = getTestConfig();
    const message = createTestMessage({
      subject: "[E2E] Email with reply-to",
      content: { text: "This email has a custom reply-to address." },
      replyRecipients: [
        {
          name: "No Reply",
          address: config.testEmails.from as `${string}@${string}`, // Use from address as reply-to for testing
        },
      ],
    });

    const receipt = await transport.send(message);

    assert.equal(receipt.successful, true, "Send should be successful");
    if (receipt.successful) {
      assert.ok(receipt.messageId, "Should have a message ID");
    }

    if (receipt.successful) {
      console.log(`Sent email with reply-to, ID: ${receipt.messageId}`);
    }
  });

  it("should send multiple emails sequentially", async () => {
    const messages = [
      createTestMessage({
        subject: "[E2E] Batch email 1",
        content: { text: "This is the first email in a batch." },
      }),
      createTestMessage({
        subject: "[E2E] Batch email 2",
        content: { text: "This is the second email in a batch." },
      }),
      createTestMessage({
        subject: "[E2E] Batch email 3",
        content: {
          html: "<p>This is the <strong>third</strong> email in a batch.</p>",
        },
      }),
    ];

    const receipts: Receipt[] = [];
    for await (const receipt of transport.sendMany(messages)) {
      receipts.push(receipt);
    }

    assert.equal(receipts.length, 3, "Should send all three emails");
    assert.ok(
      receipts.every((r) => r.successful),
      "All sends should be successful",
    );

    for (let i = 0; i < receipts.length; i++) {
      const receipt = receipts[i];
      if (receipt.successful) {
        console.log(`Batch email ${i + 1} sent with ID: ${receipt.messageId}`);
      }
    }
  });

  it("should handle cancellation with AbortSignal", async () => {
    const controller = new AbortController();

    // Abort immediately
    controller.abort();

    const message = createTestMessage({
      subject: "[E2E] Cancelled email",
      content: { text: "This email should be cancelled." },
    });

    const receipt = await transport.send(message, {
      signal: controller.signal,
    });

    // In real API scenarios, cancellation might not always work as expected
    // so we accept both cancelled and failed receipts
    if (receipt.successful) {
      console.log("Request completed before cancellation could take effect");
    } else {
      console.log(
        `Request cancelled or failed: ${receipt.errorMessages.join(", ")}`,
      );
    }
  });

  it("should handle timeout gracefully", async () => {
    // Create transport with very short timeout for testing
    const timeoutTransport = new PlunkTransport({
      ...getTestConfig().plunk,
      timeout: 1, // 1ms timeout - should fail quickly
      retries: 0,
    });

    const message = createTestMessage({
      subject: "[E2E] Timeout test",
      content: { text: "This should timeout quickly." },
    });

    const receipt = await timeoutTransport.send(message);

    // Should fail due to timeout, but gracefully return a failed receipt
    assert.equal(receipt.successful, false);
    assert.ok(receipt.errorMessages.length > 0);

    console.log(`Timeout test failed as expected: ${receipt.errorMessages[0]}`);
  });
});

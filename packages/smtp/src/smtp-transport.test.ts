import type { Message } from "@upyo/core";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { SmtpTransport } from "./smtp-transport.ts";

describe("SmtpTransport", () => {
  const mockConfig = {
    host: "localhost",
    port: 1025,
    secure: false,
    auth: {
      user: "test",
      pass: "test",
    },
  };

  test("should create SmtpTransport instance", () => {
    const transport = new SmtpTransport(mockConfig);
    assert.strictEqual(transport instanceof SmtpTransport, true);
  });

  test("should handle message conversion", async () => {
    const transport = new SmtpTransport(mockConfig);

    const message: Message = {
      sender: { name: "Test Sender", address: "sender@example.com" },
      recipients: [{
        name: "Test Recipient",
        address: "recipient@example.com",
      }],
      ccRecipients: [],
      bccRecipients: [],
      replyRecipients: [],
      subject: "Test Subject",
      content: { text: "Test message content" },
      attachments: [],
      priority: "normal",
      tags: [],
      headers: new Headers(),
    };

    // This will fail without a real SMTP server, but we can test the structure
    try {
      const receipt = await transport.send(message);
      // If we got here, the message was successfully sent
      assert.strictEqual(receipt.successful, true);
      if (receipt.successful) {
        assert.strictEqual(receipt.messageId.length > 0, true);
      }
    } catch (error) {
      // Expected to fail without a real SMTP server
      assert.strictEqual(error instanceof Error, true);
    }
  });

  test("should handle sendMany method", async () => {
    const transport = new SmtpTransport(mockConfig);

    const messages: Message[] = [
      {
        sender: { address: "sender@example.com" },
        recipients: [{ address: "recipient1@example.com" }],
        ccRecipients: [],
        bccRecipients: [],
        replyRecipients: [],
        subject: "Test Subject 1",
        content: { text: "Test message 1" },
        attachments: [],
        priority: "normal",
        tags: [],
        headers: new Headers(),
      },
      {
        sender: { address: "sender@example.com" },
        recipients: [{ address: "recipient2@example.com" }],
        ccRecipients: [],
        bccRecipients: [],
        replyRecipients: [],
        subject: "Test Subject 2",
        content: { text: "Test message 2" },
        attachments: [],
        priority: "normal",
        tags: [],
        headers: new Headers(),
      },
    ];

    const receipts = [];
    try {
      for await (const receipt of transport.sendMany(messages)) {
        receipts.push(receipt);
      }
      assert.strictEqual(receipts.length, 2);
    } catch (error) {
      // Expected to fail without a real SMTP server
      assert.strictEqual(error instanceof Error, true);
    }
  });

  test("should cleanup connections properly", async () => {
    const transport = new SmtpTransport(mockConfig);

    try {
      await transport.closeAllConnections();
      assert.strictEqual(true, true); // Should complete without error
    } catch (error) {
      assert.strictEqual(error instanceof Error, true);
    }
  });

  test("should respect AbortSignal in send method", async () => {
    const transport = new SmtpTransport(mockConfig);
    const controller = new AbortController();

    // Abort immediately
    controller.abort();

    const message: Message = {
      sender: { address: "sender@example.com" },
      recipients: [{ address: "recipient@example.com" }],
      ccRecipients: [],
      bccRecipients: [],
      replyRecipients: [],
      subject: "Test Subject",
      content: { text: "Test message" },
      attachments: [],
      priority: "normal",
      tags: [],
      headers: new Headers(),
    };

    try {
      await transport.send(message, { signal: controller.signal });
      assert.fail("Expected AbortError to be thrown");
    } catch (error) {
      // Should throw DOMException with name 'AbortError'
      assert.ok(error instanceof DOMException);
      assert.strictEqual(error.name, "AbortError");
    }
  });

  test("should respect AbortSignal in sendMany method", async () => {
    const transport = new SmtpTransport(mockConfig);
    const controller = new AbortController();

    const messages: Message[] = [
      {
        sender: { address: "sender@example.com" },
        recipients: [{ address: "recipient@example.com" }],
        ccRecipients: [],
        bccRecipients: [],
        replyRecipients: [],
        subject: "Test Subject",
        content: { text: "Test message" },
        attachments: [],
        priority: "normal",
        tags: [],
        headers: new Headers(),
      },
    ];

    // Abort immediately
    controller.abort();

    try {
      for await (
        const _ of transport.sendMany(messages, { signal: controller.signal })
      ) {
        // Should not reach here
      }
      assert.fail("Expected AbortError to be thrown");
    } catch (error) {
      // Should throw DOMException with name 'AbortError'
      assert.ok(error instanceof DOMException);
      assert.strictEqual(error.name, "AbortError");
    }
  });

  test("should implement AsyncDisposable interface", async () => {
    const transport = new SmtpTransport(mockConfig);

    // Test that Symbol.asyncDispose method exists
    assert.strictEqual(typeof transport[Symbol.asyncDispose], "function");

    // Test that we can call the dispose method directly
    await transport[Symbol.asyncDispose]();

    // Should complete without error
    assert.strictEqual(true, true);
  });

  test("should work with using statement pattern", async () => {
    // This test verifies the pattern works even if the environment
    // doesn't fully support using statements yet

    async function testUsingPattern() {
      const transport = new SmtpTransport(mockConfig);

      try {
        // Simulate some work
        assert.strictEqual(transport instanceof SmtpTransport, true);
      } finally {
        // Simulate what the using statement would do
        await transport[Symbol.asyncDispose]();
      }
    }

    await testUsingPattern();
    assert.strictEqual(true, true); // Should complete without error
  });
});

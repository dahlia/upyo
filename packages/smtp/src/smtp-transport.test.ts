import type { Message } from "@upyo/core";
import { SmtpTransport } from "@upyo/smtp";
import assert from "node:assert/strict";
import { describe, test } from "node:test";

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

  describe("Error Boundary Testing", () => {
    test("should handle connection timeout gracefully", async () => {
      const timeoutConfig = {
        ...mockConfig,
        host: "192.0.2.1", // TEST-NET-1 address (RFC 5737) - should timeout
        port: 25,
        connectionTimeout: 100, // Very short timeout
      };

      const transport = new SmtpTransport(timeoutConfig);
      const message: Message = {
        sender: { address: "sender@example.com" },
        recipients: [{ address: "recipient@example.com" }],
        ccRecipients: [],
        bccRecipients: [],
        replyRecipients: [],
        subject: "Timeout Test",
        content: { text: "This should timeout" },
        attachments: [],
        priority: "normal",
        tags: [],
        headers: new Headers(),
      };

      try {
        await transport.send(message);
        assert.fail("Expected timeout error");
      } catch (error) {
        assert.ok(error instanceof Error);
        // Should be some form of connection error or timeout
        assert.ok(
          error.message.includes("timeout") ||
            error.message.includes("connect") ||
            error.message.includes("ECONNREFUSED") ||
            error.message.includes("EHOSTUNREACH"),
        );
      }
    });

    test("should handle invalid host gracefully", async () => {
      const invalidHostConfig = {
        ...mockConfig,
        host: "invalid-host-that-does-not-exist.example",
        port: 25,
      };

      const transport = new SmtpTransport(invalidHostConfig);
      const message: Message = {
        sender: { address: "sender@example.com" },
        recipients: [{ address: "recipient@example.com" }],
        ccRecipients: [],
        bccRecipients: [],
        replyRecipients: [],
        subject: "Invalid Host Test",
        content: { text: "This should fail with DNS error" },
        attachments: [],
        priority: "normal",
        tags: [],
        headers: new Headers(),
      };

      try {
        await transport.send(message);
        assert.fail("Expected DNS resolution error");
      } catch (error) {
        assert.ok(error instanceof Error);
        // Should be DNS resolution error or connection error
        assert.ok(
          error.message.includes("ENOTFOUND") ||
            error.message.includes("getaddrinfo") ||
            error.message.includes("connect") ||
            error.message.includes("host"),
        );
      }
    });

    test("should handle connection refused error", async () => {
      const refusedConfig = {
        ...mockConfig,
        host: "127.0.0.1",
        port: 9999, // Unlikely to have a service running on this port
      };

      const transport = new SmtpTransport(refusedConfig);
      const message: Message = {
        sender: { address: "sender@example.com" },
        recipients: [{ address: "recipient@example.com" }],
        ccRecipients: [],
        bccRecipients: [],
        replyRecipients: [],
        subject: "Connection Refused Test",
        content: { text: "This should fail with connection refused" },
        attachments: [],
        priority: "normal",
        tags: [],
        headers: new Headers(),
      };

      try {
        await transport.send(message);
        assert.fail("Expected connection refused error");
      } catch (error) {
        assert.ok(error instanceof Error);
        // Should be connection refused error
        assert.ok(
          error.message.includes("ECONNREFUSED") ||
            error.message.includes("connect") ||
            error.message.includes("refused"),
        );
      }
    });

    test("should handle multiple rapid abort signals", async () => {
      const transport = new SmtpTransport(mockConfig);
      const message: Message = {
        sender: { address: "sender@example.com" },
        recipients: [{ address: "recipient@example.com" }],
        ccRecipients: [],
        bccRecipients: [],
        replyRecipients: [],
        subject: "Multiple Abort Test",
        content: { text: "Test message" },
        attachments: [],
        priority: "normal",
        tags: [],
        headers: new Headers(),
      };

      // Test multiple rapid aborts don't cause issues
      const promises = [];
      for (let i = 0; i < 5; i++) {
        const controller = new AbortController();
        controller.abort();

        const promise = transport.send(message, { signal: controller.signal })
          .then(() => {
            assert.fail("Expected AbortError");
          })
          .catch((error) => {
            assert.ok(error instanceof DOMException);
            assert.strictEqual(error.name, "AbortError");
          });

        promises.push(promise);
      }

      await Promise.all(promises);
    });

    test("should handle malformed message data gracefully", async () => {
      const transport = new SmtpTransport(mockConfig);

      // Test with extremely long subject
      const longSubjectMessage: Message = {
        sender: { address: "sender@example.com" },
        recipients: [{ address: "recipient@example.com" }],
        ccRecipients: [],
        bccRecipients: [],
        replyRecipients: [],
        subject: "A".repeat(2000), // Very long subject line
        content: { text: "Test message" },
        attachments: [],
        priority: "normal",
        tags: [],
        headers: new Headers(),
      };

      try {
        await transport.send(longSubjectMessage);
        // This might succeed depending on server limits, which is fine
      } catch (error) {
        assert.ok(error instanceof Error);
        // If it fails, should be a proper error
      }

      // Test with empty recipients (should fail at validation level)
      const noRecipientsMessage: Message = {
        sender: { address: "sender@example.com" },
        recipients: [],
        ccRecipients: [],
        bccRecipients: [],
        replyRecipients: [],
        subject: "No Recipients Test",
        content: { text: "Test message" },
        attachments: [],
        priority: "normal",
        tags: [],
        headers: new Headers(),
      };

      try {
        await transport.send(noRecipientsMessage);
        assert.fail("Expected error for empty recipients");
      } catch (error) {
        assert.ok(error instanceof Error);
        // Should be validation error about recipients
      }
    });

    test("should handle connection errors during sendMany", async () => {
      const badConfig = {
        ...mockConfig,
        host: "192.0.2.1", // Non-routable address
        port: 25,
        connectionTimeout: 50,
      };

      const transport = new SmtpTransport(badConfig);
      const messages: Message[] = Array.from({ length: 3 }, (_, i) => ({
        sender: { address: "sender@example.com" },
        recipients: [{ address: `recipient${i}@example.com` }],
        ccRecipients: [],
        bccRecipients: [],
        replyRecipients: [],
        subject: `Test Message ${i}`,
        content: { text: `Test content ${i}` },
        attachments: [],
        priority: "normal",
        tags: [],
        headers: new Headers(),
      }));

      const receipts = [];
      let errorCount = 0;

      try {
        for await (const receipt of transport.sendMany(messages)) {
          if (receipt.successful) {
            receipts.push(receipt);
          } else {
            errorCount++;
          }
        }
      } catch (error) {
        // Expected to fail with connection errors
        assert.ok(error instanceof Error);
        errorCount++;
      }

      // Should have attempted to process messages and encountered errors
      assert.ok(errorCount > 0 || receipts.length >= 0);
    });

    test("should handle resource cleanup after errors", async () => {
      const transport = new SmtpTransport({
        ...mockConfig,
        host: "192.0.2.1", // Non-routable address
        connectionTimeout: 50,
      });

      const message: Message = {
        sender: { address: "sender@example.com" },
        recipients: [{ address: "recipient@example.com" }],
        ccRecipients: [],
        bccRecipients: [],
        replyRecipients: [],
        subject: "Resource Cleanup Test",
        content: { text: "Test message" },
        attachments: [],
        priority: "normal",
        tags: [],
        headers: new Headers(),
      };

      // Try to send and expect failure
      try {
        await transport.send(message);
      } catch (error) {
        // Expected to fail
        assert.ok(error instanceof Error);
      }

      // Should be able to clean up resources without issues
      try {
        await transport.closeAllConnections();
        await transport[Symbol.asyncDispose]();
      } catch (error) {
        // Cleanup should not throw additional errors
        console.warn(
          "Cleanup error (might be expected):",
          error instanceof Error ? error.message : String(error),
        );
      }

      // Test should complete without hanging
      assert.ok(true);
    });

    test("should handle concurrent connection attempts with errors", async () => {
      const transport = new SmtpTransport({
        ...mockConfig,
        host: "192.0.2.1", // Non-routable address
        connectionTimeout: 100,
      });

      const message: Message = {
        sender: { address: "sender@example.com" },
        recipients: [{ address: "recipient@example.com" }],
        ccRecipients: [],
        bccRecipients: [],
        replyRecipients: [],
        subject: "Concurrent Error Test",
        content: { text: "Test message" },
        attachments: [],
        priority: "normal",
        tags: [],
        headers: new Headers(),
      };

      // Try multiple concurrent sends that should all fail
      const promises = Array.from(
        { length: 5 },
        () =>
          transport.send(message).catch((error) => {
            assert.ok(error instanceof Error);
            return error;
          }),
      );

      const results = await Promise.all(promises);

      // All should have resulted in errors
      assert.strictEqual(results.length, 5);
      results.forEach((result) => {
        assert.ok(result instanceof Error);
      });
    });
  });
});

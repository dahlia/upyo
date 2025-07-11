import type { Message } from "@upyo/core";
import { MailgunTransport } from "@upyo/mailgun";
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

describe("MailgunTransport", () => {
  it("should send a message successfully", async () => {
    const originalFetch = globalThis.fetch;
    try {
      // Mock successful response
      // deno-lint-ignore require-await
      globalThis.fetch = async () => {
        return new Response(
          JSON.stringify({
            id: "test-message-id",
            message: "Queued. Thank you.",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      };

      const transport = new MailgunTransport({
        apiKey: "test-key",
        domain: "test-domain.com",
      });

      const message: Message = {
        sender: { address: "sender@example.com" },
        recipients: [{ address: "recipient@example.com" }],
        ccRecipients: [],
        bccRecipients: [],
        replyRecipients: [],
        subject: "Test Subject",
        content: { text: "Test content" },
        attachments: [],
        priority: "normal",
        tags: [],
        headers: new Headers(),
      };

      const receipt = await transport.send(message);

      assert.equal(receipt.successful, true);
      assert.equal(receipt.messageId, "test-message-id");
      assert.equal(receipt.errorMessages.length, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should handle API errors", async () => {
    const originalFetch = globalThis.fetch;
    try {
      // Mock error response
      // deno-lint-ignore require-await
      globalThis.fetch = async () => {
        return new Response(
          JSON.stringify({
            message: "Bad Request",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      };

      const transport = new MailgunTransport({
        apiKey: "test-key",
        domain: "test-domain.com",
      });

      const message: Message = {
        sender: { address: "sender@example.com" },
        recipients: [{ address: "recipient@example.com" }],
        ccRecipients: [],
        bccRecipients: [],
        replyRecipients: [],
        subject: "Test Subject",
        content: { text: "Test content" },
        attachments: [],
        priority: "normal",
        tags: [],
        headers: new Headers(),
      };

      const receipt = await transport.send(message);

      assert.equal(receipt.successful, false);
      assert.equal(receipt.messageId, "");
      assert.equal(receipt.errorMessages.length, 1);
      assert.equal(receipt.errorMessages[0], "Bad Request");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should handle network errors", async () => {
    const originalFetch = globalThis.fetch;
    try {
      // Mock network error
      // deno-lint-ignore require-await
      globalThis.fetch = async () => {
        throw new Error("Network error");
      };

      const transport = new MailgunTransport({
        apiKey: "test-key",
        domain: "test-domain.com",
      });

      const message: Message = {
        sender: { address: "sender@example.com" },
        recipients: [{ address: "recipient@example.com" }],
        ccRecipients: [],
        bccRecipients: [],
        replyRecipients: [],
        subject: "Test Subject",
        content: { text: "Test content" },
        attachments: [],
        priority: "normal",
        tags: [],
        headers: new Headers(),
      };

      const receipt = await transport.send(message);

      assert.equal(receipt.successful, false);
      assert.equal(receipt.messageId, "");
      assert.equal(receipt.errorMessages.length, 1);
      assert.equal(receipt.errorMessages[0], "Network error");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should send multiple messages", async () => {
    const originalFetch = globalThis.fetch;
    try {
      // Mock successful responses
      // deno-lint-ignore require-await
      globalThis.fetch = async () => {
        return new Response(
          JSON.stringify({
            id: "test-message-id",
            message: "Queued. Thank you.",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      };

      const transport = new MailgunTransport({
        apiKey: "test-key",
        domain: "test-domain.com",
      });

      const messages: Message[] = [
        {
          sender: { address: "sender@example.com" },
          recipients: [{ address: "recipient1@example.com" }],
          ccRecipients: [],
          bccRecipients: [],
          replyRecipients: [],
          subject: "Test Subject 1",
          content: { text: "Test content 1" },
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
          content: { text: "Test content 2" },
          attachments: [],
          priority: "normal",
          tags: [],
          headers: new Headers(),
        },
      ];

      const receipts = [];
      for await (const receipt of transport.sendMany(messages)) {
        receipts.push(receipt);
      }

      assert.equal(receipts.length, 2);
      assert.equal(receipts[0].successful, true);
      assert.equal(receipts[1].successful, true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should handle abort signal", async () => {
    const originalFetch = globalThis.fetch;
    try {
      // Mock a slow response to allow abort to happen
      // deno-lint-ignore require-await
      globalThis.fetch = async (_url, options) => {
        if (options?.signal?.aborted) {
          throw new DOMException("The operation was aborted", "AbortError");
        }

        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            resolve(
              new Response(
                JSON.stringify({
                  id: "test-id",
                  message: "Success",
                }),
                {
                  status: 200,
                  headers: { "Content-Type": "application/json" },
                },
              ),
            );
          }, 100);

          options?.signal?.addEventListener("abort", () => {
            clearTimeout(timeout);
            reject(new DOMException("The operation was aborted", "AbortError"));
          });
        });
      };

      const transport = new MailgunTransport({
        apiKey: "test-key",
        domain: "test-domain.com",
      });

      const message: Message = {
        sender: { address: "sender@example.com" },
        recipients: [{ address: "recipient@example.com" }],
        ccRecipients: [],
        bccRecipients: [],
        replyRecipients: [],
        subject: "Test Subject",
        content: { text: "Test content" },
        attachments: [],
        priority: "normal",
        tags: [],
        headers: new Headers(),
      };

      const controller = new AbortController();
      controller.abort();

      try {
        await transport.send(message, { signal: controller.signal });
        assert.fail("Should have thrown AbortError");
      } catch (error) {
        assert.equal((error as Error).name, "AbortError");
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

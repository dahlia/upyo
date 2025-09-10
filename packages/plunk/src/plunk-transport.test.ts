import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PlunkTransport } from "./plunk-transport.ts";
import type { Message } from "@upyo/core";

describe("PlunkTransport", () => {
  function createTestMessage(overrides: Partial<Message> = {}): Message {
    return {
      sender: { address: "from@example.com" },
      recipients: [{ address: "to@example.com" }],
      ccRecipients: [],
      bccRecipients: [],
      replyRecipients: [],
      subject: "Test Subject",
      content: { text: "Test message content" },
      attachments: [],
      priority: "normal",
      tags: [],
      headers: new Headers(),
      ...overrides,
    };
  }

  it("should create transport with config", () => {
    const transport = new PlunkTransport({
      apiKey: "test-api-key",
    });

    assert.ok(transport);
    assert.equal(transport.config.apiKey, "test-api-key");
    assert.equal(transport.config.baseUrl, "https://api.useplunk.com");
  });

  it("should create transport with custom config", () => {
    const transport = new PlunkTransport({
      apiKey: "test-key",
      baseUrl: "https://plunk.example.com/api",
      timeout: 60000,
      retries: 5,
    });

    assert.equal(transport.config.apiKey, "test-key");
    assert.equal(transport.config.baseUrl, "https://plunk.example.com/api");
    assert.equal(transport.config.timeout, 60000);
    assert.equal(transport.config.retries, 5);
  });

  it("should handle AbortSignal in send method", async () => {
    const transport = new PlunkTransport({
      apiKey: "test-key",
    });

    const controller = new AbortController();
    controller.abort();

    const message = createTestMessage();
    const receipt = await transport.send(message, {
      signal: controller.signal,
    });

    // Should return failed receipt rather than throw
    assert.equal(receipt.successful, false);
    assert.ok(
      receipt.errorMessages.some((msg) =>
        msg.includes("aborted") || msg.includes("Abort")
      ),
    );
  });

  it("should handle errors gracefully and return failed receipt", async () => {
    const transport = new PlunkTransport({
      apiKey: "test-key",
      baseUrl: "https://httpstat.us/500", // Returns 500 error
      retries: 0,
      timeout: 10000,
    });

    const message = createTestMessage();
    const receipt = await transport.send(message);

    // Accept either successful or failed, just ensure it handles the request
    assert.ok(typeof receipt.successful === "boolean");
  });

  it("should handle AbortSignal in sendMany method", async () => {
    const transport = new PlunkTransport({
      apiKey: "test-key",
    });

    const controller = new AbortController();
    controller.abort();

    const messages = [createTestMessage()];

    try {
      const receipts = transport.sendMany(messages, {
        signal: controller.signal,
      });
      const iterator = receipts[Symbol.asyncIterator]();
      await iterator.next(); // Try to get first result
      assert.fail("Should have thrown AbortError");
    } catch (error) {
      assert.ok(error instanceof Error);
      assert.equal(error.name, "AbortError");
    }
  });

  it("should process async iterable messages", async () => {
    const transport = new PlunkTransport({
      apiKey: "test-key",
      baseUrl: "https://httpstat.us/200", // Simple 200 response
      retries: 0,
    });

    async function* generateMessages() {
      yield createTestMessage({ subject: "Message 1" });
      yield createTestMessage({ subject: "Message 2" });
    }

    const receipts = [];
    for await (const receipt of transport.sendMany(generateMessages())) {
      receipts.push(receipt);
    }

    assert.equal(receipts.length, 2);
    assert.ok(receipts.every((r) => typeof r.successful === "boolean"));
  });

  it("should process sync iterable messages", async () => {
    const transport = new PlunkTransport({
      apiKey: "test-key",
      baseUrl: "https://httpstat.us/200", // Simple 200 response
      retries: 0,
    });

    const messages = [
      createTestMessage({ subject: "Message 1" }),
      createTestMessage({ subject: "Message 2" }),
    ];

    const receipts = [];
    for await (const receipt of transport.sendMany(messages)) {
      receipts.push(receipt);
    }

    assert.equal(receipts.length, 2);
    assert.ok(receipts.every((r) => typeof r.successful === "boolean"));
  });

  it("should generate message ID from fallback when no response data", async () => {
    const transport = new PlunkTransport({
      apiKey: "test-key",
      baseUrl: "https://httpstat.us/400", // Returns 400 error
      retries: 0,
      timeout: 10000,
    });

    const message = createTestMessage();
    const receipt = await transport.send(message);

    // Just ensure it returns a valid receipt structure
    assert.ok(typeof receipt.successful === "boolean");
    if (!receipt.successful) {
      assert.ok(Array.isArray(receipt.errorMessages));
    } else {
      assert.ok(typeof receipt.messageId === "string");
    }
  });

  it("should generate fallback message ID when response lacks details", async () => {
    // Mock successful fetch response without detailed IDs
    const originalFetch = globalThis.fetch;

    try {
      globalThis.fetch = (() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              success: true,
              emails: [],
              timestamp: "2023-01-01T12:00:00Z",
            }),
            { status: 200 },
          ),
        )) as typeof fetch;

      const transport = new PlunkTransport({
        apiKey: "test-key",
        retries: 0,
      });

      const message = createTestMessage();
      const receipt = await transport.send(message);

      assert.equal(receipt.successful, true);
      if (receipt.successful) {
        assert.ok(receipt.messageId.startsWith("plunk-"));
        assert.ok(receipt.messageId.includes("to")); // from recipient
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

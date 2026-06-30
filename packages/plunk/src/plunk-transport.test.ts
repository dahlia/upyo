import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PlunkTransport } from "./plunk-transport.ts";
import type { Message } from "@upyo/core";

// Bun runs tests within a describe block concurrently, which can cause
// globalThis.fetch mocking to interfere between tests. Node.js runs tests
// sequentially so it doesn't have this issue. By separating each test into
// its own describe block, we ensure that fetch mocking is isolated between
// tests in both environments.

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

describe("PlunkTransport - Configuration", () => {
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
});

describe("PlunkTransport - AbortSignal (send)", () => {
  it("should handle AbortSignal in send method", async () => {
    const transport = new PlunkTransport({
      apiKey: "test-key",
    });

    const controller = new AbortController();
    controller.abort();

    const message = createTestMessage();
    try {
      await transport.send(message, { signal: controller.signal });
      assert.fail("Should have thrown AbortError");
    } catch (error) {
      assert.ok(error instanceof Error);
      assert.equal(error.name, "AbortError");
    }
  });
});

describe("PlunkTransport - AbortSignal (sendMany)", () => {
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
      await iterator.next();
      assert.fail("Should have thrown AbortError");
    } catch (error) {
      assert.ok(error instanceof Error);
      assert.equal(error.name, "AbortError");
    }
  });
});

describe("PlunkTransport - HTTP 500 error", () => {
  it("should handle errors gracefully and return failed receipt", async () => {
    const originalFetch = globalThis.fetch;
    try {
      // deno-lint-ignore require-await
      globalThis.fetch = async () =>
        new Response("Internal Server Error", { status: 500 });

      const transport = new PlunkTransport({
        apiKey: "test-key",
        retries: 0,
      });

      const message = createTestMessage();
      const receipt = await transport.send(message);

      assert.equal(receipt.successful, false);
      if (!receipt.successful) {
        assert.equal(receipt.provider, "plunk");
        assert.equal(receipt.retryable, true);
        assert.equal(receipt.errors?.[0]?.category, "server-error");
        assert.equal(receipt.errors?.[0]?.statusCode, 500);
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("PlunkTransport - HTTP 400 error", () => {
  it("should generate message ID from fallback when no response data", async () => {
    const originalFetch = globalThis.fetch;
    try {
      // deno-lint-ignore require-await
      globalThis.fetch = async () =>
        new Response("Bad Request", { status: 400 });

      const transport = new PlunkTransport({
        apiKey: "test-key",
        retries: 0,
      });

      const message = createTestMessage();
      const receipt = await transport.send(message);

      assert.equal(receipt.successful, false);
      assert.ok(Array.isArray(receipt.errorMessages));
      if (!receipt.successful) {
        assert.equal(receipt.provider, "plunk");
        assert.equal(receipt.retryable, false);
        assert.equal(receipt.errors?.[0]?.category, "validation");
        assert.equal(receipt.errors?.[0]?.statusCode, 400);
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("PlunkTransport - sendMany async iterable", () => {
  it("should process async iterable messages", async () => {
    const originalFetch = globalThis.fetch;
    try {
      // deno-lint-ignore require-await
      globalThis.fetch = async () =>
        new Response(
          JSON.stringify({
            success: true,
            emails: [{
              contact: { id: "c1", email: "to@example.com" },
              email: "to@example.com",
            }],
            timestamp: "2024-01-01T00:00:00Z",
          }),
          { status: 200 },
        );

      const transport = new PlunkTransport({ apiKey: "test-key", retries: 0 });

      const generateMessages = async function* () {
        yield createTestMessage({ subject: "Message 1" });
        yield createTestMessage({ subject: "Message 2" });
      };

      const receipts = [];
      for await (const receipt of transport.sendMany(generateMessages())) {
        receipts.push(receipt);
      }

      assert.equal(receipts.length, 2);
      assert.ok(receipts.every((r) => r.successful === true));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("PlunkTransport - sendMany sync iterable", () => {
  it("should process sync iterable messages", async () => {
    const originalFetch = globalThis.fetch;
    try {
      // deno-lint-ignore require-await
      globalThis.fetch = async () =>
        new Response(
          JSON.stringify({
            success: true,
            emails: [{
              contact: { id: "c1", email: "to@example.com" },
              email: "to@example.com",
            }],
            timestamp: "2024-01-01T00:00:00Z",
          }),
          { status: 200 },
        );

      const transport = new PlunkTransport({ apiKey: "test-key", retries: 0 });

      const messages = [
        createTestMessage({ subject: "Message 1" }),
        createTestMessage({ subject: "Message 2" }),
      ];

      const receipts = [];
      for await (const receipt of transport.sendMany(messages)) {
        receipts.push(receipt);
      }

      assert.equal(receipts.length, 2);
      assert.ok(receipts.every((r) => r.successful === true));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("PlunkTransport - fallback message ID", () => {
  it("should generate fallback message ID when response lacks details", async () => {
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
        assert.ok(receipt.messageId.includes("to"));
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { PlunkTransport } from "./plunk-transport.ts";
import type { Message } from "@upyo/core";

const successfulResponse = {
  success: true,
  data: {
    emails: [{
      contact: {
        id: "contact-id",
        email: "to@example.com",
      },
      email: "email-record-id",
    }],
    timestamp: "2023-01-01T12:00:00Z",
  },
};

async function withPlunkServer(
  fixture: {
    readonly status?: number;
    readonly body: unknown;
  },
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server = createServer((_request, response) => {
    response.writeHead(fixture.status ?? 200, {
      "Connection": "close",
      "Content-Type": "application/json",
    });
    response.end(JSON.stringify(fixture.body));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

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
    assert.equal(transport.config.baseUrl, "https://next-api.useplunk.com");
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
    await withPlunkServer(
      { status: 500, body: { message: "server error" } },
      async (baseUrl) => {
        const transport = new PlunkTransport({
          apiKey: "test-key",
          baseUrl,
          retries: 0,
        });

        const receipt = await transport.send(createTestMessage());

        assert.equal(receipt.successful, false);
        if (!receipt.successful) {
          assert.ok(receipt.errorMessages.length > 0);
        }
      },
    );
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
    await withPlunkServer({ body: successfulResponse }, async (baseUrl) => {
      const transport = new PlunkTransport({
        apiKey: "test-key",
        baseUrl,
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
      assert.ok(receipts.every((receipt) => receipt.successful));
    });
  });

  it("should process sync iterable messages", async () => {
    await withPlunkServer({ body: successfulResponse }, async (baseUrl) => {
      const transport = new PlunkTransport({
        apiKey: "test-key",
        baseUrl,
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
      assert.ok(receipts.every((receipt) => receipt.successful));
    });
  });

  it("should generate message ID from fallback when no response data", async () => {
    await withPlunkServer(
      {
        body: {
          success: true,
          data: {
            emails: [],
            timestamp: "2023-01-01T12:00:00Z",
          },
        },
      },
      async (baseUrl) => {
        const transport = new PlunkTransport({
          apiKey: "test-key",
          baseUrl,
          retries: 0,
        });

        const receipt = await transport.send(createTestMessage());

        assert.equal(receipt.successful, true);
        if (receipt.successful) {
          assert.match(receipt.messageId, /^plunk-/);
        }
      },
    );
  });

  it("should use the Plunk email record ID from the response", async () => {
    await withPlunkServer({ body: successfulResponse }, async (baseUrl) => {
      const transport = new PlunkTransport({
        apiKey: "test-key",
        baseUrl,
        retries: 0,
      });

      const receipt = await transport.send(createTestMessage());

      assert.deepEqual(receipt, {
        successful: true,
        messageId: "email-record-id",
      });
    });
  });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { PlunkTransport } from "./plunk-transport.ts";
import type { Message } from "@upyo/core";

// Bun runs tests within a describe block concurrently. Keeping tests that
// replace globals in separate describe blocks prevents their mocks from
// interfering with other tests.

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
    response.end(
      typeof fixture.body === "string"
        ? fixture.body
        : JSON.stringify(fixture.body),
    );
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

  it("should preserve abort reasons without AbortSignal.any", async () => {
    const originalAny = AbortSignal.any;
    const originalFetch = globalThis.fetch;
    const abortReason = new Error("Stop plunk request.");
    const controller = new AbortController();

    try {
      Object.defineProperty(AbortSignal, "any", {
        value: undefined,
        configurable: true,
        writable: true,
      });
      globalThis.fetch = (_input, init) =>
        new Promise((_resolve, reject) => {
          assert.ok(init?.signal instanceof AbortSignal);
          init.signal.addEventListener("abort", () => {
            reject(init.signal?.reason);
          }, { once: true });
          setTimeout(() => controller.abort(abortReason), 0);
        });

      const transport = new PlunkTransport({
        apiKey: "test-key",
        retries: 0,
      });

      await assert.rejects(
        () =>
          transport.send(createTestMessage(), { signal: controller.signal }),
        (error: unknown) => error === abortReason,
      );
    } finally {
      globalThis.fetch = originalFetch;
      Object.defineProperty(AbortSignal, "any", {
        value: originalAny,
        configurable: true,
        writable: true,
      });
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
    await withPlunkServer(
      { status: 500, body: "Internal Server Error" },
      async (baseUrl) => {
        const transport = new PlunkTransport({
          apiKey: "test-key",
          baseUrl,
          retries: 0,
        });

        const receipt = await transport.send(createTestMessage());

        assert.equal(receipt.successful, false);
        if (!receipt.successful) {
          assert.equal(receipt.provider, "plunk");
          assert.equal(receipt.retryable, true);
          assert.equal(receipt.errors?.[0]?.category, "server-error");
          assert.equal(receipt.errors?.[0]?.statusCode, 500);
        }
      },
    );
  });

  it("should truncate long error response bodies", async () => {
    const longBody = "x".repeat(600);
    await withPlunkServer(
      { status: 500, body: longBody },
      async (baseUrl) => {
        const transport = new PlunkTransport({
          apiKey: "test-key",
          baseUrl,
          retries: 0,
        });

        const receipt = await transport.send(createTestMessage());

        assert.ok(!receipt.successful);
        assert.equal(
          receipt.errorMessages[0],
          `HTTP 500: Internal Server Error. ${"x".repeat(500)}...`,
        );
      },
    );
  });
});

describe("PlunkTransport - HTTP 400 error", () => {
  it("should return a failed receipt for a client error", async () => {
    await withPlunkServer(
      { status: 400, body: "Bad Request" },
      async (baseUrl) => {
        const transport = new PlunkTransport({
          apiKey: "test-key",
          baseUrl,
          retries: 0,
        });

        const receipt = await transport.send(createTestMessage());

        assert.equal(receipt.successful, false);
        assert.ok(Array.isArray(receipt.errorMessages));
        if (!receipt.successful) {
          assert.equal(receipt.provider, "plunk");
          assert.equal(receipt.retryable, false);
          assert.equal(receipt.errors?.[0]?.category, "validation");
          assert.equal(receipt.errors?.[0]?.statusCode, 400);
        }
      },
    );
  });
});

describe("PlunkTransport - sendMany async iterable", () => {
  it("should process async iterable messages", async () => {
    await withPlunkServer({ body: successfulResponse }, async (baseUrl) => {
      const transport = new PlunkTransport({
        apiKey: "test-key",
        baseUrl,
        retries: 0,
      });

      const generateMessages = async function* () {
        yield createTestMessage({ subject: "Message 1" });
        yield createTestMessage({ subject: "Message 2" });
      };

      const receipts = [];
      for await (const receipt of transport.sendMany(generateMessages())) {
        receipts.push(receipt);
      }

      assert.equal(receipts.length, 2);
      assert.ok(receipts.every((receipt) => receipt.successful));
    });
  });
});

describe("PlunkTransport - sendMany sync iterable", () => {
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
});

describe("PlunkTransport - fallback message ID", () => {
  it("should generate fallback message ID when response lacks details", async () => {
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
          assert.ok(receipt.messageId.includes("to"));
        }
      },
    );
  });
});

describe("PlunkTransport - response message ID", () => {
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
        provider: "plunk",
      });
    });
  });
});

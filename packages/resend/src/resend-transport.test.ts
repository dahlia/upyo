import type { Message } from "@upyo/core";
import { createResendConfig } from "./config.ts";
import { ResendHttpClient } from "./http-client.ts";
import { ResendTransport } from "./resend-transport.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

// Note: Tests are split into separate describe blocks instead of one unified block
// because Deno runs tests within the same describe block concurrently, which causes
// globalThis.fetch mocking to interfere between tests. Node.js runs tests sequentially
// so it doesn't have this issue. By separating each test into its own describe block,
// we ensure that fetch mocking is isolated between tests in both environments.

let fetchMockChain = Promise.resolve();

async function withMockedFetch<T>(
  fetchMock: typeof globalThis.fetch,
  callback: () => Promise<T>,
): Promise<T> {
  const previous = fetchMockChain;
  let release: () => void = () => {};
  fetchMockChain = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;

  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = fetchMock;
    return await callback();
  } finally {
    globalThis.fetch = originalFetch;
    release();
  }
}

describe("ResendTransport - Send Message", () => {
  it("should send a message successfully", async () => {
    const originalFetch = globalThis.fetch;
    try {
      // Mock successful response
      // deno-lint-ignore require-await
      globalThis.fetch = async () => {
        return new Response(
          JSON.stringify({
            id: "test-message-id",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      };

      const transport = new ResendTransport({
        apiKey: "test-key",
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
      if (receipt.successful) {
        assert.equal(receipt.messageId, "test-message-id");
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("ResendTransport - API Errors", () => {
  it("should handle API errors", async () => {
    await withMockedFetch(
      () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              message: "Invalid API key",
            }),
            {
              status: 401,
              headers: { "Content-Type": "application/json" },
            },
          ),
        ),
      async () => {
        const transport = new ResendTransport({
          apiKey: "invalid-key",
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
        if (!receipt.successful) {
          assert.ok(receipt.errorMessages.length > 0);
          assert.ok(receipt.errorMessages[0].includes("Invalid API key"));
          assert.equal(receipt.provider, "resend");
          assert.equal(receipt.retryable, false);
          assert.equal(receipt.attempts, 1);
          assert.equal(receipt.errors?.[0]?.category, "auth");
          assert.equal(receipt.errors?.[0]?.statusCode, 401);
        }
      },
    );
  });

  it("should truncate non-JSON error response bodies", async () => {
    const longBody = "x".repeat(600);
    await withMockedFetch(
      () => Promise.resolve(new Response(longBody, { status: 500 })),
      async () => {
        const transport = new ResendTransport({
          apiKey: "test-key",
          retries: 0,
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

        assert.ok(!receipt.successful);
        assert.equal(receipt.errorMessages[0], `${"x".repeat(500)}...`);
      },
    );
  });

  it("should expose rate limit retry metadata", async () => {
    await withMockedFetch(
      () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              message: "Rate limit exceeded",
            }),
            {
              status: 429,
              headers: { "Retry-After": "20" },
            },
          ),
        ),
      async () => {
        const transport = new ResendTransport({
          apiKey: "test-key",
          retries: 0,
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
        if (!receipt.successful) {
          assert.equal(receipt.provider, "resend");
          assert.equal(receipt.retryable, true);
          assert.equal(receipt.errors?.[0]?.category, "rate-limit");
          assert.equal(receipt.errors?.[0]?.retryAfterMilliseconds, 20_000);
        }
      },
    );
  });
});

describe("ResendHttpClient - Abort Signal", () => {
  it("should pass an already aborted signal to fetch", async () => {
    await withMockedFetch(
      (_url, init) => {
        assert.ok(init?.signal instanceof AbortSignal);
        assert.ok(init.signal.aborted);
        return Promise.reject(
          new DOMException("The operation was aborted.", "AbortError"),
        );
      },
      async () => {
        const client = new ResendHttpClient(
          createResendConfig({ apiKey: "test-key", retries: 0 }),
        );
        const controller = new AbortController();
        controller.abort();

        await assert.rejects(
          () => client.sendMessage({}, controller.signal),
          { name: "AbortError" },
        );
      },
    );
  });

  it("falls back when AbortSignal.any is unavailable", async () => {
    const originalAny = AbortSignal.any;
    const controller = new AbortController();
    let addedAbortListeners = 0;
    let removedAbortListeners = 0;
    const addEventListener = controller.signal.addEventListener.bind(
      controller.signal,
    );
    const removeEventListener = controller.signal.removeEventListener.bind(
      controller.signal,
    );

    Object.defineProperty(controller.signal, "addEventListener", {
      value: (
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions,
      ) => {
        if (type === "abort") addedAbortListeners++;
        addEventListener(type, listener, options);
      },
    });
    Object.defineProperty(controller.signal, "removeEventListener", {
      value: (
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | EventListenerOptions,
      ) => {
        if (type === "abort") removedAbortListeners++;
        removeEventListener(type, listener, options);
      },
    });

    await withMockedFetch(
      (_url, init) => {
        assert.ok(init?.signal instanceof AbortSignal);
        return Promise.resolve(
          new Response(JSON.stringify({ id: "msg_fallback" })),
        );
      },
      async () => {
        Object.defineProperty(AbortSignal, "any", {
          value: undefined,
          configurable: true,
          writable: true,
        });
        try {
          const client = new ResendHttpClient(
            createResendConfig({ apiKey: "test-key", retries: 0 }),
          );

          await client.sendMessage({}, controller.signal);

          assert.ok(addedAbortListeners > 0);
          assert.equal(removedAbortListeners, addedAbortListeners);
        } finally {
          Object.defineProperty(AbortSignal, "any", {
            value: originalAny,
            configurable: true,
            writable: true,
          });
        }
      },
    );
  });
});

describe("ResendTransport - Network Errors", () => {
  it("should handle network errors", async () => {
    const originalFetch = globalThis.fetch;
    try {
      // Mock network error
      // deno-lint-ignore require-await
      globalThis.fetch = async () => {
        throw new Error("Network error");
      };

      const transport = new ResendTransport({
        apiKey: "test-key",
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
      if (!receipt.successful) {
        assert.ok(receipt.errorMessages.length > 0);
        assert.ok(receipt.errorMessages[0].includes("Network error"));
        assert.equal(receipt.provider, "resend");
        assert.equal(receipt.retryable, true);
        assert.equal(receipt.attempts, 4);
        assert.equal(receipt.errors?.[0]?.category, "network");
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("ResendTransport - Abort Signal", () => {
  it("should handle abort signal", async () => {
    const originalFetch = globalThis.fetch;
    try {
      // Mock slow response
      // deno-lint-ignore require-await
      globalThis.fetch = async () => {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve(
              new Response(
                JSON.stringify({ id: "test-id" }),
                { status: 200 },
              ),
            );
          }, 1000);
        });
      };

      const transport = new ResendTransport({
        apiKey: "test-key",
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
        assert.ok(error instanceof Error);
        assert.equal(error.name, "AbortError");
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("ResendTransport - Batch Sending Small", () => {
  it("should send small batch using batch API", async () => {
    const originalFetch = globalThis.fetch;
    try {
      // Mock batch API response
      // deno-lint-ignore require-await
      globalThis.fetch = async (url) => {
        // Check that batch endpoint is called
        if (typeof url === "string" && url.includes("/emails/batch")) {
          return new Response(
            JSON.stringify({
              data: [
                { id: "message-1" },
                { id: "message-2" },
              ],
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        throw new Error("Unexpected URL called");
      };

      const transport = new ResendTransport({
        apiKey: "test-key",
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

      if (receipts[0].successful && receipts[1].successful) {
        assert.equal(receipts[0].messageId, "message-1");
        assert.equal(receipts[1].messageId, "message-2");
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("ResendTransport - Individual Sending", () => {
  it("should fall back to individual requests for messages with attachments", async () => {
    const originalFetch = globalThis.fetch;
    let callCount = 0;

    try {
      // Mock individual API responses
      // deno-lint-ignore require-await
      globalThis.fetch = async (url) => {
        callCount++;
        // Should call individual endpoint, not batch
        if (
          typeof url === "string" && url.includes("/emails") &&
          !url.includes("/batch")
        ) {
          return new Response(
            JSON.stringify({ id: `message-${callCount}` }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        throw new Error("Unexpected URL called");
      };

      const transport = new ResendTransport({
        apiKey: "test-key",
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
          attachments: [{
            filename: "test.txt",
            content: new Uint8Array(10),
            contentType: "text/plain",
            inline: false,
            contentId: "",
          }],
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
      assert.equal(callCount, 2); // Should make 2 individual calls
      assert.equal(receipts[0].successful, true);
      assert.equal(receipts[1].successful, true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("ResendTransport - Empty Batch", () => {
  it("should handle empty message array", async () => {
    const transport = new ResendTransport({
      apiKey: "test-key",
    });

    const receipts = [];
    for await (const receipt of transport.sendMany([])) {
      receipts.push(receipt);
    }

    assert.equal(receipts.length, 0);
  });
});

describe("ResendTransport - Config Validation", () => {
  it("should create transport with minimal config", () => {
    const transport = new ResendTransport({
      apiKey: "test-key",
    });

    assert.equal(transport.config.apiKey, "test-key");
    assert.equal(transport.config.baseUrl, "https://api.resend.com");
    assert.equal(transport.config.timeout, 30000);
    assert.equal(transport.config.retries, 3);
  });

  it("should create transport with custom config", () => {
    const transport = new ResendTransport({
      apiKey: "test-key",
      baseUrl: "https://custom.resend.com",
      timeout: 60000,
      retries: 5,
    });

    assert.equal(transport.config.apiKey, "test-key");
    assert.equal(transport.config.baseUrl, "https://custom.resend.com");
    assert.equal(transport.config.timeout, 60000);
    assert.equal(transport.config.retries, 5);
  });
});

// Note: Idempotency key tests are split into separate describe blocks
// because Deno runs tests within the same describe block concurrently,
// which causes globalThis.fetch mocking to interfere between tests.

describe("ResendTransport - Idempotency Key Provided", () => {
  it("should use provided idempotency key in HTTP header", async () => {
    const originalFetch = globalThis.fetch;
    const captured: { headers: Headers | null } = { headers: null };

    try {
      // Mock fetch to capture headers
      globalThis.fetch = (_url, init) => {
        captured.headers = new Headers(init?.headers);
        return Promise.resolve(
          new Response(
            JSON.stringify({ id: "test-message-id" }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      };

      const transport = new ResendTransport({ apiKey: "test-key" });

      const testKey = `test-key-${Date.now()}`;
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
        idempotencyKey: testKey,
      };

      await transport.send(message);

      assert.ok(captured.headers !== null);
      assert.equal(captured.headers.get("Idempotency-Key"), testKey);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("ResendTransport - Idempotency Key Auto-generated", () => {
  it("should generate idempotency key when not provided", async () => {
    const originalFetch = globalThis.fetch;
    const captured: { headers: Headers | null } = { headers: null };

    try {
      globalThis.fetch = (_url, init) => {
        captured.headers = new Headers(init?.headers);
        return Promise.resolve(
          new Response(
            JSON.stringify({ id: "test-message-id" }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      };

      const transport = new ResendTransport({ apiKey: "test-key" });

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

      await transport.send(message);

      assert.ok(captured.headers !== null);
      const idempotencyKey = captured.headers.get("Idempotency-Key");
      assert.ok(idempotencyKey, "Idempotency-Key header should be present");
      assert.ok(
        idempotencyKey.length > 10,
        "Auto-generated key should have reasonable length",
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("ResendTransport - Idempotency Key Retry", () => {
  it("should allow retry with same idempotency key", async () => {
    const originalFetch = globalThis.fetch;
    const capturedKeys: string[] = [];

    try {
      let callCount = 0;
      globalThis.fetch = (_url, init) => {
        const headers = new Headers(init?.headers);
        const key = headers.get("Idempotency-Key");
        if (key) capturedKeys.push(key);

        callCount++;
        if (callCount === 1) {
          // First call fails
          return Promise.resolve(
            new Response(
              JSON.stringify({ message: "Server error" }),
              { status: 500, headers: { "Content-Type": "application/json" } },
            ),
          );
        }
        // Second call succeeds
        return Promise.resolve(
          new Response(
            JSON.stringify({ id: "test-message-id" }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      };

      const transport = new ResendTransport({ apiKey: "test-key", retries: 0 });

      const idempotencyKey = `retry-key-${Date.now()}`;
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
        idempotencyKey,
      };

      // First attempt fails
      const receipt1 = await transport.send(message);
      assert.equal(receipt1.successful, false);

      // Retry with same message (same idempotency key)
      const receipt2 = await transport.send(message);
      assert.equal(receipt2.successful, true);

      // Both calls should use the same key
      assert.equal(capturedKeys.length, 2);
      assert.equal(capturedKeys[0], idempotencyKey);
      assert.equal(capturedKeys[1], idempotencyKey);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("ResendTransport - Idempotency Key Batch", () => {
  it("should use provided idempotency key in batch API", async () => {
    const originalFetch = globalThis.fetch;
    const captured: { headers: Headers | null } = { headers: null };

    try {
      globalThis.fetch = (url, init) => {
        if (typeof url === "string" && url.includes("/emails/batch")) {
          captured.headers = new Headers(init?.headers);
          return Promise.resolve(
            new Response(
              JSON.stringify({
                data: [{ id: "message-1" }, { id: "message-2" }],
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            ),
          );
        }
        return Promise.reject(new Error("Unexpected URL called"));
      };

      const transport = new ResendTransport({ apiKey: "test-key" });

      const batchKey = `batch-key-${Date.now()}`;
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
          idempotencyKey: batchKey, // First message's key is used for batch
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

      assert.ok(captured.headers !== null);
      assert.equal(captured.headers.get("Idempotency-Key"), batchKey);
      assert.equal(receipts.length, 2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

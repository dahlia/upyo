import type { Message } from "@upyo/core";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MailtrapTransport } from "./mailtrap-transport.ts";

function createMessage(overrides: Partial<Message> = {}): Message {
  return {
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
    ...overrides,
  };
}

// Deno runs node:test subtests concurrently, so serialize tests that replace
// globalThis.fetch to keep their mocks isolated.
let testChain = Promise.resolve();

function serialIt(name: string, callback: () => Promise<void>): void {
  it(name, async () => {
    const previous = testChain;
    let release: () => void = () => {};
    testChain = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;

    try {
      await callback();
    } finally {
      release();
    }
  });
}

function createDelayedJsonResponse(
  signal: AbortSignal | null | undefined,
  onBodyRead: () => void,
  delay: number,
): Response {
  const body = new TextEncoder().encode(JSON.stringify({
    success: true,
    message_ids: ["test-message-id"],
  }));
  let started = false;

  return new Response(
    new ReadableStream<Uint8Array>({
      pull(controller) {
        if (started) return;
        started = true;
        onBodyRead();

        if (signal?.aborted) {
          controller.error(signal.reason);
          return;
        }

        const onAbort = () => {
          clearTimeout(timeoutId);
          controller.error(signal?.reason);
        };
        signal?.addEventListener("abort", onAbort, { once: true });

        const timeoutId = setTimeout(() => {
          signal?.removeEventListener("abort", onAbort);
          controller.enqueue(body);
          controller.close();
        }, delay);
      },
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}

describe("MailtrapTransport - Send Message", () => {
  serialIt("should send a message successfully", async () => {
    const originalFetch = globalThis.fetch;
    try {
      // deno-lint-ignore require-await
      globalThis.fetch = async (input, init) => {
        assert.equal(
          input,
          "https://send.api.mailtrap.io/api/send",
        );
        const headers = new Headers(init?.headers);
        assert.equal(headers.get("Api-Token"), "test-token");
        assert.equal(headers.get("User-Agent"), "@upyo/mailtrap");

        return new Response(
          JSON.stringify({
            success: true,
            message_ids: ["test-message-id"],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      };

      const transport = new MailtrapTransport({
        apiToken: "test-token",
      });

      const receipt = await transport.send(createMessage());

      assert.ok(receipt.successful);
      if (receipt.successful) {
        assert.equal(receipt.messageId, "test-message-id");
        assert.equal(receipt.provider, "mailtrap");
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("exposes the mailtrap provider id", () => {
    const transport = new MailtrapTransport({ apiToken: "test-token" });
    assert.equal(transport.id, "mailtrap");
  });
});

describe("MailtrapTransport - Sandbox URL", () => {
  serialIt("should use sandbox endpoint when configured", async () => {
    const originalFetch = globalThis.fetch;
    try {
      // deno-lint-ignore require-await
      globalThis.fetch = async (input) => {
        assert.equal(
          input,
          "https://sandbox.api.mailtrap.io/api/send/12345",
        );

        return new Response(
          JSON.stringify({
            success: true,
            message_ids: ["sandbox-message-id"],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      };

      const transport = new MailtrapTransport({
        apiToken: "test-token",
        sandbox: true,
        inboxId: 12345,
      });

      const receipt = await transport.send(createMessage());

      assert.ok(receipt.successful);
      if (receipt.successful) {
        assert.equal(receipt.messageId, "sandbox-message-id");
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("MailtrapTransport - API Errors", () => {
  serialIt("should handle API errors", async () => {
    const originalFetch = globalThis.fetch;
    try {
      // deno-lint-ignore require-await
      globalThis.fetch = async () => {
        return new Response(
          JSON.stringify({
            errors: ["Invalid API token"],
          }),
          {
            status: 401,
            headers: { "Content-Type": "application/json" },
          },
        );
      };

      const transport = new MailtrapTransport({
        apiToken: "invalid-token",
        retries: 0,
      });

      const receipt = await transport.send(createMessage());

      assert.ok(!receipt.successful);
      if (!receipt.successful) {
        assert.match(receipt.errorMessages[0], /Invalid API token/);
        assert.equal(receipt.provider, "mailtrap");
        assert.equal(receipt.errors?.[0]?.statusCode, 401);
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  serialIt(
    "uses the sandbox rate-limit window when Retry-After is missing",
    async () => {
      const originalFetch = globalThis.fetch;
      try {
        // deno-lint-ignore require-await
        globalThis.fetch = async () => {
          return new Response(
            JSON.stringify({
              success: false,
              errors: [
                "Too many emails per second. Please upgrade your plan.",
              ],
            }),
            {
              status: 429,
              headers: { "Content-Type": "application/json" },
            },
          );
        };

        const transport = new MailtrapTransport({
          apiToken: "test-token",
          sandbox: true,
          inboxId: 12345,
          retries: 0,
        });

        const receipt = await transport.send(createMessage());

        assert.ok(!receipt.successful);
        if (!receipt.successful) {
          assert.equal(receipt.errors?.[0]?.statusCode, 429);
          assert.equal(
            receipt.errors?.[0]?.retryAfterMilliseconds,
            10_000,
          );
        }
      } finally {
        globalThis.fetch = originalFetch;
      }
    },
  );

  serialIt(
    "prefers Retry-After over the sandbox rate-limit window",
    async () => {
      const originalFetch = globalThis.fetch;
      try {
        // deno-lint-ignore require-await
        globalThis.fetch = async () => {
          return new Response(
            JSON.stringify({
              success: false,
              errors: ["Too many emails per second."],
            }),
            {
              status: 429,
              headers: {
                "Content-Type": "application/json",
                "Retry-After": "12",
              },
            },
          );
        };

        const transport = new MailtrapTransport({
          apiToken: "test-token",
          sandbox: true,
          inboxId: 12345,
          retries: 0,
        });

        const receipt = await transport.send(createMessage());

        assert.ok(!receipt.successful);
        if (!receipt.successful) {
          assert.equal(
            receipt.errors?.[0]?.retryAfterMilliseconds,
            12_000,
          );
        }
      } finally {
        globalThis.fetch = originalFetch;
      }
    },
  );

  serialIt(
    "does not infer a delay for unrelated sandbox rate limits",
    async () => {
      const originalFetch = globalThis.fetch;
      try {
        // deno-lint-ignore require-await
        globalThis.fetch = async () => {
          return new Response(
            JSON.stringify({
              success: false,
              errors: ["Monthly testing limit exhausted."],
            }),
            {
              status: 429,
              headers: { "Content-Type": "application/json" },
            },
          );
        };

        const transport = new MailtrapTransport({
          apiToken: "test-token",
          sandbox: true,
          inboxId: 12345,
          retries: 0,
        });

        const receipt = await transport.send(createMessage());

        assert.ok(!receipt.successful);
        if (!receipt.successful) {
          assert.equal(
            receipt.errors?.[0]?.retryAfterMilliseconds,
            undefined,
          );
        }
      } finally {
        globalThis.fetch = originalFetch;
      }
    },
  );

  serialIt(
    "truncates non-JSON API response bodies in failure receipts",
    async () => {
      const originalFetch = globalThis.fetch;
      try {
        // deno-lint-ignore require-await
        globalThis.fetch = async () => {
          return new Response("x".repeat(600), {
            status: 503,
            headers: { "Content-Type": "text/html" },
          });
        };

        const transport = new MailtrapTransport({
          apiToken: "test-token",
          retries: 0,
        });

        const receipt = await transport.send(createMessage());

        assert.ok(!receipt.successful);
        if (!receipt.successful) {
          assert.equal(receipt.errorMessages[0], `${"x".repeat(500)}...`);
        }
      } finally {
        globalThis.fetch = originalFetch;
      }
    },
  );

  serialIt("should handle provider-reported send failures", async () => {
    const originalFetch = globalThis.fetch;
    try {
      // deno-lint-ignore require-await
      globalThis.fetch = async () => {
        return new Response(
          JSON.stringify({
            success: false,
            errors: ["Invalid from address"],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      };

      const transport = new MailtrapTransport({
        apiToken: "test-token",
      });

      const receipt = await transport.send(createMessage());

      assert.ok(!receipt.successful);
      if (!receipt.successful) {
        assert.equal(receipt.errorMessages[0], "Invalid from address");
        assert.equal(receipt.provider, "mailtrap");
        assert.equal(receipt.errors?.[0]?.code, "mailtrap.unsuccessful");
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  serialIt(
    "does not retry invalid JSON from successful responses",
    async () => {
      const originalFetch = globalThis.fetch;
      let requests = 0;
      try {
        // deno-lint-ignore require-await
        globalThis.fetch = async () => {
          requests++;
          return new Response("not json", {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        };

        const transport = new MailtrapTransport({
          apiToken: "test-token",
          retries: 1,
        });

        const receipt = await transport.send(createMessage());

        assert.ok(!receipt.successful);
        assert.equal(requests, 1);
      } finally {
        globalThis.fetch = originalFetch;
      }
    },
  );

  serialIt("times out while reading the response body", async () => {
    const originalFetch = globalThis.fetch;
    try {
      // deno-lint-ignore require-await
      globalThis.fetch = async (_input, init) => {
        return createDelayedJsonResponse(init?.signal, () => {}, 100);
      };

      const transport = new MailtrapTransport({
        apiToken: "test-token",
        timeout: 10,
        retries: 0,
      });

      const receipt = await transport.send(createMessage());

      assert.ok(!receipt.successful);
      if (!receipt.successful) {
        assert.equal(
          receipt.errorMessages[0],
          "Mailtrap API request timed out after 10 ms.",
        );
        assert.equal(receipt.errors?.[0]?.category, "timeout");
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  serialIt(
    "propagates caller cancellation while reading the response body",
    async () => {
      const originalFetch = globalThis.fetch;
      const controller = new AbortController();
      let bodyRead: () => void = () => {};
      const bodyReading = new Promise<void>((resolve) => {
        bodyRead = resolve;
      });

      try {
        // deno-lint-ignore require-await
        globalThis.fetch = async (_input, init) => {
          return createDelayedJsonResponse(init?.signal, bodyRead, 100);
        };

        const transport = new MailtrapTransport({
          apiToken: "test-token",
          timeout: 0,
          retries: 0,
        });
        const sending = transport.send(createMessage(), {
          signal: controller.signal,
        });

        await bodyReading;
        controller.abort();

        await assert.rejects(sending, { name: "AbortError" });
      } finally {
        globalThis.fetch = originalFetch;
      }
    },
  );
});

describe("MailtrapTransport - Batch Send", () => {
  serialIt("should send a batch successfully", async () => {
    const originalFetch = globalThis.fetch;
    try {
      // deno-lint-ignore require-await
      globalThis.fetch = async (input, init) => {
        assert.equal(
          input,
          "https://send.api.mailtrap.io/api/batch",
        );

        const body = JSON.parse(String(init?.body));
        assert.equal(body.requests.length, 2);

        return new Response(
          JSON.stringify({
            success: true,
            responses: [
              { success: true, message_ids: ["id-1"] },
              { success: true, message_ids: ["id-2"] },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      };

      const transport = new MailtrapTransport({
        apiToken: "test-token",
      });

      const receipts = [];
      for await (
        const receipt of transport.sendMany([
          createMessage({ subject: "One" }),
          createMessage({ subject: "Two" }),
        ])
      ) {
        receipts.push(receipt);
      }

      assert.equal(receipts.length, 2);
      assert.ok(receipts[0]?.successful);
      assert.ok(receipts[1]?.successful);
      if (receipts[0]?.successful) {
        assert.equal(receipts[0].messageId, "id-1");
      }
      if (receipts[1]?.successful) {
        assert.equal(receipts[1].messageId, "id-2");
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  serialIt("should handle per-item batch failures", async () => {
    const originalFetch = globalThis.fetch;
    try {
      // deno-lint-ignore require-await
      globalThis.fetch = async () => {
        return new Response(
          JSON.stringify({
            success: true,
            responses: [
              { success: true, message_ids: ["id-1"] },
              { success: false, errors: ["Invalid recipient"] },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      };

      const transport = new MailtrapTransport({
        apiToken: "test-token",
      });

      const receipts = [];
      for await (
        const receipt of transport.sendMany([
          createMessage(),
          createMessage(),
        ])
      ) {
        receipts.push(receipt);
      }

      assert.ok(receipts[0]?.successful);
      assert.ok(!receipts[1]?.successful);
      if (receipts[1] && !receipts[1].successful) {
        assert.equal(receipts[1].errorMessages[0], "Invalid recipient");
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  serialIt("chunks batches at the Mailtrap limit", async () => {
    const originalFetch = globalThis.fetch;
    const requestSizes: number[] = [];
    try {
      // deno-lint-ignore require-await
      globalThis.fetch = async (_input, init) => {
        const body: unknown = JSON.parse(String(init?.body));
        assert.ok(
          typeof body === "object" &&
            body !== null &&
            "requests" in body &&
            Array.isArray(body.requests),
        );
        const requests = body.requests;
        requestSizes.push(requests.length);
        return new Response(
          JSON.stringify({
            success: true,
            responses: requests.map((_: unknown, index: number) => ({
              success: true,
              message_ids: [`id-${requestSizes.length}-${index}`],
            })),
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      };

      const transport = new MailtrapTransport({ apiToken: "test-token" });
      const messages = Array.from(
        { length: 501 },
        (_, index) => createMessage({ subject: `Message ${index}` }),
      );
      let receipts = 0;

      for await (const _receipt of transport.sendMany(messages)) {
        receipts++;
      }

      assert.equal(receipts, 501);
      assert.deepEqual(requestSizes, [500, 1]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

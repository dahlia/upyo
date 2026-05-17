import type { Message, Receipt } from "@upyo/core";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LettermintTransport } from "./lettermint-transport.ts";

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

describe("LettermintTransport - config", { concurrency: false }, () => {
  it("creates a transport with minimal config", () => {
    const transport = new LettermintTransport({
      apiToken: "test-token",
    });

    assert.equal(transport.config.apiToken, "test-token");
    assert.equal(transport.config.baseUrl, "https://api.lettermint.co");
    assert.equal(transport.config.timeout, 30000);
    assert.equal(transport.config.retries, 3);
  });

  it("creates a transport with custom config", () => {
    const transport = new LettermintTransport({
      apiToken: "test-token",
      baseUrl: "https://lettermint.example.com",
      timeout: 10000,
      retries: 1,
      route: "transactional",
      tag: "welcome",
    });

    assert.equal(transport.config.baseUrl, "https://lettermint.example.com");
    assert.equal(transport.config.timeout, 10000);
    assert.equal(transport.config.retries, 1);
    assert.equal(transport.config.route, "transactional");
    assert.equal(transport.config.tag, "welcome");
  });
});

describe("LettermintTransport - send", { concurrency: false }, () => {
  it("sends a message successfully", async () => {
    let capturedUrl = "";
    let capturedBody: unknown;
    let capturedHeaders = new Headers();

    await withMockedFetch(
      (url, init) => {
        capturedUrl = String(url);
        capturedBody = JSON.parse(String(init?.body));
        capturedHeaders = new Headers(init?.headers);
        return Promise.resolve(
          new Response(
            JSON.stringify({ message_id: "msg_123", status: "pending" }),
            {
              status: 202,
              headers: { "Content-Type": "application/json" },
            },
          ),
        );
      },
      async () => {
        const transport = new LettermintTransport({
          apiToken: "test-token",
          baseUrl: "https://api.example.com",
        });
        const receipt = await transport.send(createMessage({
          idempotencyKey: "idem-123",
        }));

        assert.equal(capturedUrl, "https://api.example.com/v1/send");
        assert.equal(capturedHeaders.get("x-lettermint-token"), "test-token");
        assert.equal(capturedHeaders.get("Idempotency-Key"), "idem-123");
        assert.deepEqual(capturedBody, {
          from: "sender@example.com",
          to: ["recipient@example.com"],
          subject: "Test Subject",
          text: "Test content",
        });
        assert.equal(receipt.successful, true);
        if (receipt.successful) {
          assert.equal(receipt.messageId, "msg_123");
        }
      },
    );
  });

  it("returns failure receipts for API errors", async () => {
    await withMockedFetch(
      () =>
        Promise.resolve(
          new Response(
            JSON.stringify({ message: "Invalid API token" }),
            {
              status: 401,
              headers: { "Content-Type": "application/json" },
            },
          ),
        ),
      async () => {
        const transport = new LettermintTransport({
          apiToken: "bad-token",
          retries: 0,
        });
        const receipt = await transport.send(createMessage());

        assert.equal(receipt.successful, false);
        if (!receipt.successful) {
          assert.deepEqual(receipt.errorMessages, ["Invalid API token"]);
        }
      },
    );
  });

  it("generates an idempotency key when not provided", async () => {
    let capturedHeaders = new Headers();

    await withMockedFetch(
      (_url, init) => {
        capturedHeaders = new Headers(init?.headers);
        return Promise.resolve(
          new Response(
            JSON.stringify({ message_id: "msg_123", status: "pending" }),
            { status: 202, headers: { "Content-Type": "application/json" } },
          ),
        );
      },
      async () => {
        const transport = new LettermintTransport({ apiToken: "test-token" });
        await transport.send(createMessage());

        const idempotencyKey = capturedHeaders.get("Idempotency-Key");
        assert.ok(idempotencyKey);
        assert.ok(idempotencyKey.length > 10);
      },
    );
  });

  it("generates an idempotency key when the provided key is empty", async () => {
    let capturedHeaders = new Headers();

    await withMockedFetch(
      (_url, init) => {
        capturedHeaders = new Headers(init?.headers);
        return Promise.resolve(
          new Response(
            JSON.stringify({ message_id: "msg_123", status: "pending" }),
            { status: 202, headers: { "Content-Type": "application/json" } },
          ),
        );
      },
      async () => {
        const transport = new LettermintTransport({ apiToken: "test-token" });
        await transport.send(createMessage({ idempotencyKey: "" }));

        const idempotencyKey = capturedHeaders.get("Idempotency-Key");
        assert.ok(idempotencyKey);
        assert.notEqual(idempotencyKey, "");
      },
    );
  });

  it("retries request timeouts from the transport config", async () => {
    let calls = 0;

    await withMockedFetch(
      (_url, init) => {
        calls++;
        if (calls === 1) {
          return new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(
                new DOMException("The operation was aborted.", "AbortError"),
              );
            }, { once: true });
          });
        }
        return Promise.resolve(
          new Response(
            JSON.stringify({ message_id: "msg_retry", status: "pending" }),
            { status: 202, headers: { "Content-Type": "application/json" } },
          ),
        );
      },
      async () => {
        const transport = new LettermintTransport({
          apiToken: "test-token",
          timeout: 1,
          retries: 1,
        });
        const receipt = await transport.send(createMessage());

        assert.equal(calls, 2);
        assert.equal(receipt.successful, true);
        if (receipt.successful) {
          assert.equal(receipt.messageId, "msg_retry");
        }
      },
    );
  });

  it("retries 429 rate limit responses", async () => {
    let calls = 0;

    await withMockedFetch(
      () => {
        calls++;
        if (calls === 1) {
          return Promise.resolve(
            new Response(
              JSON.stringify({ message: "Too many requests" }),
              { status: 429, headers: { "Content-Type": "application/json" } },
            ),
          );
        }
        return Promise.resolve(
          new Response(
            JSON.stringify({ message_id: "msg_rate_limit", status: "pending" }),
            { status: 202, headers: { "Content-Type": "application/json" } },
          ),
        );
      },
      async () => {
        const transport = new LettermintTransport({
          apiToken: "test-token",
          retries: 1,
        });
        const receipt = await transport.send(createMessage());

        assert.equal(calls, 2);
        assert.equal(receipt.successful, true);
        if (receipt.successful) {
          assert.equal(receipt.messageId, "msg_rate_limit");
        }
      },
    );
  });

  it("removes abort listeners after retry backoff completes", async () => {
    let calls = 0;
    let addedAbortListeners = 0;
    let removedAbortListeners = 0;
    const controller = new AbortController();
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
      () => {
        calls++;
        if (calls === 1) {
          return Promise.resolve(
            new Response(
              JSON.stringify({ message: "Too many requests" }),
              { status: 429, headers: { "Content-Type": "application/json" } },
            ),
          );
        }
        return Promise.resolve(
          new Response(
            JSON.stringify({ message_id: "msg_rate_limit", status: "pending" }),
            { status: 202, headers: { "Content-Type": "application/json" } },
          ),
        );
      },
      async () => {
        const transport = new LettermintTransport({
          apiToken: "test-token",
          retries: 1,
        });
        const receipt = await transport.send(
          createMessage(),
          { signal: controller.signal },
        );

        assert.equal(receipt.successful, true);
        assert.ok(addedAbortListeners > 0);
        assert.equal(removedAbortListeners, addedAbortListeners);
      },
    );
  });

  it("falls back when AbortSignal.any is unavailable", async () => {
    const originalAny = AbortSignal.any;
    let addedAbortListeners = 0;
    let removedAbortListeners = 0;
    const controller = new AbortController();
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
      () =>
        Promise.resolve(
          new Response(
            JSON.stringify({ message_id: "msg_fallback", status: "pending" }),
            { status: 202, headers: { "Content-Type": "application/json" } },
          ),
        ),
      async () => {
        Object.defineProperty(AbortSignal, "any", {
          value: undefined,
          configurable: true,
          writable: true,
        });
        try {
          const transport = new LettermintTransport({
            apiToken: "test-token",
          });
          const receipt = await transport.send(
            createMessage(),
            { signal: controller.signal },
          );

          assert.equal(receipt.successful, true);
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

describe("LettermintTransport - sendMany", { concurrency: false }, () => {
  it("uses the batch API for multiple messages", async () => {
    let capturedUrl = "";
    let capturedBody: unknown;
    let capturedHeaders = new Headers();

    await withMockedFetch(
      (url, init) => {
        capturedUrl = String(url);
        capturedBody = JSON.parse(String(init?.body));
        capturedHeaders = new Headers(init?.headers);
        return Promise.resolve(
          new Response(
            JSON.stringify([
              { message_id: "msg_1", status: "pending" },
              { message_id: "msg_2", status: "queued" },
            ]),
            { status: 202, headers: { "Content-Type": "application/json" } },
          ),
        );
      },
      async () => {
        const transport = new LettermintTransport({
          apiToken: "test-token",
          baseUrl: "https://api.example.com",
        });
        const messages = [
          createMessage({
            recipients: [{ address: "one@example.com" }],
            idempotencyKey: "batch-key",
          }),
          createMessage({
            recipients: [{ address: "two@example.com" }],
          }),
        ];

        const receipts: Receipt[] = [];
        for await (const receipt of transport.sendMany(messages)) {
          receipts.push(receipt);
        }

        assert.equal(capturedUrl, "https://api.example.com/v1/send/batch");
        assert.equal(capturedHeaders.get("Idempotency-Key"), "batch-key");
        assert.deepEqual(capturedBody, [
          {
            from: "sender@example.com",
            to: ["one@example.com"],
            subject: "Test Subject",
            text: "Test content",
          },
          {
            from: "sender@example.com",
            to: ["two@example.com"],
            subject: "Test Subject",
            text: "Test content",
          },
        ]);
        assert.equal(receipts.length, 2);
        assert.equal(receipts[0].successful, true);
        assert.equal(receipts[1].successful, true);
        if (receipts[0].successful && receipts[1].successful) {
          assert.equal(receipts[0].messageId, "msg_1");
          assert.equal(receipts[1].messageId, "msg_2");
        }
      },
    );
  });

  it("generates a batch idempotency key when the first key is empty", async () => {
    let capturedHeaders = new Headers();

    await withMockedFetch(
      (_url, init) => {
        capturedHeaders = new Headers(init?.headers);
        return Promise.resolve(
          new Response(
            JSON.stringify([
              { message_id: "msg_1", status: "pending" },
              { message_id: "msg_2", status: "pending" },
            ]),
            { status: 202, headers: { "Content-Type": "application/json" } },
          ),
        );
      },
      async () => {
        const transport = new LettermintTransport({ apiToken: "test-token" });
        const receipts: Receipt[] = [];
        for await (
          const receipt of transport.sendMany([
            createMessage({ idempotencyKey: "" }),
            createMessage(),
          ])
        ) {
          receipts.push(receipt);
        }

        const idempotencyKey = capturedHeaders.get("Idempotency-Key");
        assert.ok(idempotencyKey);
        assert.notEqual(idempotencyKey, "");
        assert.ok(receipts.every((receipt) => receipt.successful));
      },
    );
  });

  it("chunks batches over 500 messages", async () => {
    const bodySizes: number[] = [];

    await withMockedFetch(
      (_url, init) => {
        const body = JSON.parse(String(init?.body)) as unknown[];
        bodySizes.push(body.length);
        return Promise.resolve(
          new Response(
            JSON.stringify(
              body.map((_, index) => ({
                message_id: `msg_${bodySizes.length}_${index}`,
                status: "pending",
              })),
            ),
            { status: 202, headers: { "Content-Type": "application/json" } },
          ),
        );
      },
      async () => {
        const transport = new LettermintTransport({ apiToken: "test-token" });
        const messages = Array.from(
          { length: 501 },
          (_, index) =>
            createMessage({
              recipients: [{ address: `user${index}@example.com` }],
            }),
        );

        const receipts: Receipt[] = [];
        for await (const receipt of transport.sendMany(messages)) {
          receipts.push(receipt);
        }

        assert.deepEqual(bodySizes, [500, 1]);
        assert.equal(receipts.length, 501);
        assert.ok(receipts.every((receipt) => receipt.successful));
      },
    );
  });

  it("streams async batches as each chunk fills", async () => {
    const bodySizes: number[] = [];
    let generated = 0;

    async function* messages(): AsyncIterable<Message> {
      for (let index = 0; index < 501; index++) {
        generated++;
        yield createMessage({
          recipients: [{ address: `user${index}@example.com` }],
        });
      }
    }

    await withMockedFetch(
      (_url, init) => {
        const body = JSON.parse(String(init?.body)) as unknown[];
        bodySizes.push(body.length);
        return Promise.resolve(
          new Response(
            JSON.stringify(
              body.map((_, index) => ({
                message_id: `msg_${bodySizes.length}_${index}`,
                status: "pending",
              })),
            ),
            { status: 202, headers: { "Content-Type": "application/json" } },
          ),
        );
      },
      async () => {
        const transport = new LettermintTransport({ apiToken: "test-token" });
        const receipts: Receipt[] = [];
        for await (const receipt of transport.sendMany(messages())) {
          receipts.push(receipt);
          if (receipts.length === 500) break;
        }

        assert.deepEqual(bodySizes, [500]);
        assert.equal(generated, 500);
        assert.equal(receipts.length, 500);
        assert.ok(receipts.every((receipt) => receipt.successful));
      },
    );
  });

  it("returns no receipts for empty input", async () => {
    const transport = new LettermintTransport({ apiToken: "test-token" });
    const receipts: Receipt[] = [];

    for await (const receipt of transport.sendMany([])) {
      receipts.push(receipt);
    }

    assert.equal(receipts.length, 0);
  });

  it("returns per-message failures for batch conversion errors", async () => {
    let capturedBody: unknown;

    await withMockedFetch(
      (_url, init) => {
        capturedBody = JSON.parse(String(init?.body));
        return Promise.resolve(
          new Response(
            JSON.stringify([
              { message_id: "msg_1", status: "pending" },
              { message_id: "msg_2", status: "pending" },
            ]),
            { status: 202, headers: { "Content-Type": "application/json" } },
          ),
        );
      },
      async () => {
        const transport = new LettermintTransport({ apiToken: "test-token" });
        const receipts: Receipt[] = [];
        for await (
          const receipt of transport.sendMany([
            createMessage({
              recipients: [{ address: "one@example.com" }],
            }),
            createMessage({
              recipients: [{ address: "bad@example.com" }],
              tags: ["one", "two"],
            }),
            createMessage({
              recipients: [{ address: "two@example.com" }],
            }),
          ])
        ) {
          receipts.push(receipt);
        }

        assert.deepEqual(capturedBody, [
          {
            from: "sender@example.com",
            to: ["one@example.com"],
            subject: "Test Subject",
            text: "Test content",
          },
          {
            from: "sender@example.com",
            to: ["two@example.com"],
            subject: "Test Subject",
            text: "Test content",
          },
        ]);
        assert.equal(receipts.length, 3);
        assert.equal(receipts[0].successful, true);
        assert.equal(receipts[1].successful, false);
        assert.equal(receipts[2].successful, true);
        if (receipts[0].successful && receipts[2].successful) {
          assert.equal(receipts[0].messageId, "msg_1");
          assert.equal(receipts[2].messageId, "msg_2");
        }
        if (!receipts[1].successful) {
          assert.deepEqual(receipts[1].errorMessages, [
            "Lettermint supports at most one tag per message.",
          ]);
        }
      },
    );
  });

  it("returns one failed receipt per message when a batch fails", async () => {
    await withMockedFetch(
      () =>
        Promise.resolve(
          new Response(
            JSON.stringify({ message: "Batch rejected" }),
            {
              status: 422,
              headers: { "Content-Type": "application/json" },
            },
          ),
        ),
      async () => {
        const transport = new LettermintTransport({
          apiToken: "test-token",
          retries: 0,
        });
        const receipts: Receipt[] = [];
        for await (
          const receipt of transport.sendMany([
            createMessage(),
            createMessage(),
          ])
        ) {
          receipts.push(receipt);
        }

        assert.equal(receipts.length, 2);
        assert.ok(receipts.every((receipt) => !receipt.successful));
        for (const receipt of receipts) {
          if (!receipt.successful) {
            assert.deepEqual(receipt.errorMessages, ["Batch rejected"]);
          }
        }
      },
    );
  });
});

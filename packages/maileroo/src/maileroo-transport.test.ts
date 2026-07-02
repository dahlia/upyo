import type { Message, Receipt } from "@upyo/core";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MailerooTransport } from "./maileroo-transport.ts";

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

describe("MailerooTransport - config", { concurrency: false }, () => {
  it("creates a transport with minimal config", () => {
    const transport = new MailerooTransport({
      apiKey: "test-key",
    });

    assert.equal(transport.config.apiKey, "test-key");
    assert.equal(transport.config.baseUrl, "https://smtp.maileroo.com/api/v2");
    assert.equal(transport.config.timeout, 30000);
    assert.equal(transport.config.retries, 3);
  });

  it("creates a transport with custom config", () => {
    const transport = new MailerooTransport({
      apiKey: "test-key",
      baseUrl: "https://maileroo.example.com/api",
      timeout: 10000,
      retries: 1,
      tracking: true,
      tags: { source: "upyo-test" },
    });

    assert.equal(transport.config.baseUrl, "https://maileroo.example.com/api");
    assert.equal(transport.config.timeout, 10000);
    assert.equal(transport.config.retries, 1);
    assert.ok(transport.config.tracking);
    assert.deepEqual(transport.config.tags, { source: "upyo-test" });
  });
});

describe("MailerooTransport - send", { concurrency: false }, () => {
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
            JSON.stringify({
              success: true,
              message: "The email has been scheduled for delivery.",
              data: { reference_id: "c843204e3af03193bd14f339" },
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
        );
      },
      async () => {
        const transport = new MailerooTransport({
          apiKey: "test-key",
          baseUrl: "https://api.example.com",
        });
        const receipt = await transport.send(createMessage());

        assert.equal(capturedUrl, "https://api.example.com/emails");
        assert.equal(capturedHeaders.get("X-API-Key"), "test-key");
        assert.deepEqual(capturedBody, {
          from: { address: "sender@example.com" },
          to: { address: "recipient@example.com" },
          subject: "Test Subject",
          plain: "Test content",
        });
        assert.ok(receipt.successful);
        if (receipt.successful) {
          assert.equal(receipt.messageId, "c843204e3af03193bd14f339");
          assert.equal(receipt.provider, "maileroo");
        }
      },
    );
  });

  it("adds configured request headers after auth defaults", async () => {
    let capturedHeaders = new Headers();

    await withMockedFetch(
      (_url, init) => {
        capturedHeaders = new Headers(init?.headers);
        return Promise.resolve(
          new Response(
            JSON.stringify({
              success: true,
              data: { reference_id: "c843204e3af03193bd14f339" },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      },
      async () => {
        const transport = new MailerooTransport({
          apiKey: "test-key",
          headers: { "X-Trace-ID": "trace-123" },
        });

        await transport.send(createMessage());

        assert.equal(capturedHeaders.get("X-Trace-ID"), "trace-123");
        assert.equal(capturedHeaders.get("Content-Type"), "application/json");
      },
    );
  });

  it("returns failure receipts for API errors", async () => {
    await withMockedFetch(
      () =>
        Promise.resolve(
          new Response(
            JSON.stringify({ message: "Invalid API key" }),
            {
              status: 401,
              headers: { "Content-Type": "application/json" },
            },
          ),
        ),
      async () => {
        const transport = new MailerooTransport({
          apiKey: "bad-key",
          retries: 0,
        });
        const receipt = await transport.send(createMessage());

        assert.ok(!receipt.successful);
        if (!receipt.successful) {
          assert.deepEqual(receipt.errorMessages, ["Invalid API key"]);
          assert.equal(receipt.provider, "maileroo");
          assert.ok(!receipt.retryable);
          assert.equal(receipt.errors?.[0]?.category, "auth");
          assert.equal(receipt.errors?.[0]?.statusCode, 401);
        }
      },
    );
  });

  it("truncates non-JSON API response bodies in failure receipts", async () => {
    await withMockedFetch(
      () =>
        Promise.resolve(
          new Response("x".repeat(600), {
            status: 503,
            headers: { "Content-Type": "text/html" },
          }),
        ),
      async () => {
        const transport = new MailerooTransport({
          apiKey: "test-key",
          retries: 0,
        });
        const receipt = await transport.send(createMessage());

        assert.ok(!receipt.successful);
        if (!receipt.successful) {
          assert.equal(receipt.errorMessages[0], `${"x".repeat(500)}...`);
        }
      },
    );
  });

  it("returns failed receipts for unsuccessful JSON responses", async () => {
    await withMockedFetch(
      () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              success: false,
              message: "Message rejected",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        ),
      async () => {
        const transport = new MailerooTransport({ apiKey: "test-key" });
        const receipt = await transport.send(createMessage());

        assert.ok(!receipt.successful);
        if (!receipt.successful) {
          assert.deepEqual(receipt.errorMessages, ["Message rejected"]);
          assert.equal(receipt.provider, "maileroo");
          assert.ok(!receipt.retryable);
          assert.equal(receipt.errors?.[0]?.category, "rejected");
          assert.equal(receipt.errors?.[0]?.code, "maileroo.unsuccessful");
        }
      },
    );
  });

  it("returns failed receipts when the reference ID is missing", async () => {
    await withMockedFetch(
      () =>
        Promise.resolve(
          new Response(
            JSON.stringify({ success: true, data: {} }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        ),
      async () => {
        const transport = new MailerooTransport({ apiKey: "test-key" });
        const receipt = await transport.send(createMessage());

        assert.ok(!receipt.successful);
        if (!receipt.successful) {
          assert.deepEqual(receipt.errorMessages, [
            "Maileroo response is missing a reference ID.",
          ]);
          assert.equal(
            receipt.errors?.[0]?.code,
            "maileroo.missing_reference_id",
          );
        }
      },
    );
  });

  it("propagates AbortError for aborted sends", async () => {
    const controller = new AbortController();
    controller.abort();

    const transport = new MailerooTransport({ apiKey: "test-key" });

    await assert.rejects(
      () => transport.send(createMessage(), { signal: controller.signal }),
      { name: "AbortError" },
    );
  });

  it("propagates custom caller abort reasons during sends", async () => {
    const controller = new AbortController();
    const reason = new Error("Stop Maileroo send.");

    await withMockedFetch(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(init.signal?.reason);
          }, { once: true });
          setTimeout(() => controller.abort(reason), 0);
        }),
      async () => {
        const transport = new MailerooTransport({
          apiKey: "test-key",
          retries: 0,
        });

        await assert.rejects(
          () => transport.send(createMessage(), { signal: controller.signal }),
          (error: unknown) => error === reason,
        );
      },
    );
  });

  it("keeps request timeouts active while reading response bodies", async () => {
    await withMockedFetch(
      (_url, init) => {
        const response = new Response(null, {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
        Object.defineProperty(response, "text", {
          value: () =>
            new Promise<string>((_resolve, reject) => {
              init?.signal?.addEventListener("abort", () => {
                reject(
                  new DOMException("The operation was aborted.", "AbortError"),
                );
              }, { once: true });
              setTimeout(() => {
                reject(new Error("Body read was not aborted."));
              }, 50);
            }),
        });
        return Promise.resolve(response);
      },
      async () => {
        const transport = new MailerooTransport({
          apiKey: "test-key",
          timeout: 1,
          retries: 0,
        });
        const receipt = await transport.send(createMessage());

        assert.ok(!receipt.successful);
        if (!receipt.successful) {
          assert.equal(receipt.errors?.[0]?.category, "timeout");
          assert.ok(receipt.retryable);
        }
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
            JSON.stringify({
              success: true,
              data: { reference_id: "c843204e3af03193bd14f339" },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      },
      async () => {
        const transport = new MailerooTransport({
          apiKey: "test-key",
          timeout: 1,
          retries: 1,
        });
        const receipt = await transport.send(createMessage());

        assert.equal(calls, 2);
        assert.ok(receipt.successful);
      },
    );
  });

  it("preserves custom caller abort reasons during retry delays", async () => {
    const controller = new AbortController();
    const reason = new Error("Stop retrying Maileroo send.");

    await withMockedFetch(
      () =>
        Promise.resolve(
          new Response(
            JSON.stringify({ message: "Too many requests" }),
            { status: 429, headers: { "Content-Type": "application/json" } },
          ),
        ),
      async () => {
        const transport = new MailerooTransport({
          apiKey: "test-key",
          retries: 1,
        });
        setTimeout(() => controller.abort(reason), 0);

        await assert.rejects(
          () => transport.send(createMessage(), { signal: controller.signal }),
          (error: unknown) => error === reason,
        );
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
            JSON.stringify({
              success: true,
              data: { reference_id: "c843204e3af03193bd14f339" },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      },
      async () => {
        const transport = new MailerooTransport({
          apiKey: "test-key",
          retries: 1,
        });
        const receipt = await transport.send(createMessage());

        assert.equal(calls, 2);
        assert.ok(receipt.successful);
      },
    );
  });

  it("respects Retry-After delays before retrying rate limits", async () => {
    let calls = 0;
    const originalRandom = Math.random;

    await withMockedFetch(
      () => {
        calls++;
        if (calls === 1) {
          return Promise.resolve(
            new Response(
              JSON.stringify({ message: "Too many requests" }),
              {
                status: 429,
                headers: {
                  "Content-Type": "application/json",
                  "Retry-After": "1",
                },
              },
            ),
          );
        }
        return Promise.resolve(
          new Response(
            JSON.stringify({
              success: true,
              data: { reference_id: "c843204e3af03193bd14f339" },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      },
      async () => {
        Math.random = () => 0;
        const startedAt = performance.now();
        const transport = new MailerooTransport({
          apiKey: "test-key",
          retries: 1,
        });
        try {
          const receipt = await transport.send(createMessage());

          assert.equal(calls, 2);
          assert.ok(receipt.successful);
          assert.ok(performance.now() - startedAt >= 900);
        } finally {
          Math.random = originalRandom;
        }
      },
    );
  });

  it("exposes Retry-After metadata when retries are exhausted", async () => {
    await withMockedFetch(
      () =>
        Promise.resolve(
          new Response(
            JSON.stringify({ message: "Too many requests" }),
            {
              status: 429,
              headers: { "Retry-After": "20" },
            },
          ),
        ),
      async () => {
        const transport = new MailerooTransport({
          apiKey: "test-key",
          retries: 0,
        });
        const receipt = await transport.send(createMessage());

        assert.ok(!receipt.successful);
        if (!receipt.successful) {
          assert.equal(receipt.provider, "maileroo");
          assert.ok(receipt.retryable);
          assert.equal(receipt.errors?.[0]?.category, "rate-limit");
          assert.equal(receipt.errors?.[0]?.retryAfterMilliseconds, 20_000);
        }
      },
    );
  });

  it("does not retry redirection responses", async () => {
    let calls = 0;

    await withMockedFetch(
      () => {
        calls++;
        return Promise.resolve(
          new Response("", {
            status: 302,
            headers: { Location: "https://api.example.com/other" },
          }),
        );
      },
      async () => {
        const transport = new MailerooTransport({
          apiKey: "test-key",
          retries: 1,
        });
        const receipt = await transport.send(createMessage());

        assert.equal(calls, 1);
        assert.ok(!receipt.successful);
        if (!receipt.successful) {
          assert.deepEqual(receipt.errorMessages, ["HTTP 302"]);
        }
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
            JSON.stringify({
              success: true,
              data: { reference_id: "c843204e3af03193bd14f339" },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        ),
      async () => {
        Object.defineProperty(AbortSignal, "any", {
          value: undefined,
          configurable: true,
          writable: true,
        });
        try {
          const transport = new MailerooTransport({
            apiKey: "test-key",
          });
          const receipt = await transport.send(
            createMessage(),
            { signal: controller.signal },
          );

          assert.ok(receipt.successful);
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

describe("MailerooTransport - sendMany", { concurrency: false }, () => {
  it("sends messages sequentially", async () => {
    const capturedBodies: unknown[] = [];

    await withMockedFetch(
      (_url, init) => {
        capturedBodies.push(JSON.parse(String(init?.body)));
        return Promise.resolve(
          new Response(
            JSON.stringify({
              success: true,
              data: {
                reference_id: `c843204e3af03193bd14f33${capturedBodies.length}`,
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      },
      async () => {
        const transport = new MailerooTransport({ apiKey: "test-key" });
        const receipts: Receipt[] = [];
        for await (
          const receipt of transport.sendMany([
            createMessage({ recipients: [{ address: "one@example.com" }] }),
            createMessage({ recipients: [{ address: "two@example.com" }] }),
          ])
        ) {
          receipts.push(receipt);
        }

        assert.deepEqual(capturedBodies, [
          {
            from: { address: "sender@example.com" },
            to: { address: "one@example.com" },
            subject: "Test Subject",
            plain: "Test content",
          },
          {
            from: { address: "sender@example.com" },
            to: { address: "two@example.com" },
            subject: "Test Subject",
            plain: "Test content",
          },
        ]);
        assert.equal(receipts.length, 2);
        assert.ok(receipts.every((receipt) => receipt.successful));
      },
    );
  });

  it("streams async input one message at a time", async () => {
    const capturedBodies: unknown[] = [];
    let generated = 0;

    async function* messages(): AsyncIterable<Message> {
      for (let index = 0; index < 2; index++) {
        generated++;
        yield createMessage({
          recipients: [{ address: `user${index}@example.com` }],
        });
      }
    }

    await withMockedFetch(
      (_url, init) => {
        capturedBodies.push(JSON.parse(String(init?.body)));
        return Promise.resolve(
          new Response(
            JSON.stringify({
              success: true,
              data: {
                reference_id: `c843204e3af03193bd14f33${capturedBodies.length}`,
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      },
      async () => {
        const transport = new MailerooTransport({ apiKey: "test-key" });
        const receipts: Receipt[] = [];
        for await (const receipt of transport.sendMany(messages())) {
          receipts.push(receipt);
          if (receipts.length === 1) break;
        }

        assert.equal(generated, 1);
        assert.equal(capturedBodies.length, 1);
        assert.equal(receipts.length, 1);
        assert.ok(receipts.every((receipt) => receipt.successful));
      },
    );
  });

  it("returns no receipts for empty input", async () => {
    const transport = new MailerooTransport({ apiKey: "test-key" });
    const receipts: Receipt[] = [];

    for await (const receipt of transport.sendMany([])) {
      receipts.push(receipt);
    }

    assert.equal(receipts.length, 0);
  });

  it("returns per-message failures", async () => {
    let calls = 0;

    await withMockedFetch(
      () => {
        calls++;
        if (calls === 2) {
          return Promise.resolve(
            new Response(
              JSON.stringify({ message: "Message rejected" }),
              { status: 422, headers: { "Content-Type": "application/json" } },
            ),
          );
        }
        return Promise.resolve(
          new Response(
            JSON.stringify({
              success: true,
              data: {
                reference_id: `c843204e3af03193bd14f33${calls}`,
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      },
      async () => {
        const transport = new MailerooTransport({
          apiKey: "test-key",
          retries: 0,
        });
        const receipts: Receipt[] = [];
        for await (
          const receipt of transport.sendMany([
            createMessage({ recipients: [{ address: "one@example.com" }] }),
            createMessage({ recipients: [{ address: "two@example.com" }] }),
            createMessage({ recipients: [{ address: "three@example.com" }] }),
          ])
        ) {
          receipts.push(receipt);
        }

        assert.equal(receipts.length, 3);
        assert.ok(receipts[0].successful);
        assert.ok(!receipts[1].successful);
        assert.ok(receipts[2].successful);
        if (!receipts[1].successful) {
          assert.deepEqual(receipts[1].errorMessages, ["Message rejected"]);
        }
      },
    );
  });
});

import { createMessage } from "@upyo/core";
import { type SesConfig, SesTransport } from "@upyo/ses";
import assert from "node:assert/strict";
import { test } from "node:test";

test("SesTransport constructor creates instance with valid config", () => {
  const config: SesConfig = {
    authentication: {
      type: "credentials",
      accessKeyId: "test-key",
      secretAccessKey: "test-secret",
    },
  };

  const transport = new SesTransport(config);

  assert.ok(transport instanceof SesTransport);
  assert.equal(transport.config.region, "us-east-1");
  assert.equal(transport.config.authentication.type, "credentials");
});

test("SesTransport handles AbortSignal cancellation", async () => {
  const config: SesConfig = {
    authentication: {
      type: "credentials",
      accessKeyId: "test-key",
      secretAccessKey: "test-secret",
    },
  };

  const transport = new SesTransport(config);
  const controller = new AbortController();
  controller.abort();

  const message = createMessage({
    from: "sender@example.com",
    to: "recipient@example.com",
    subject: "Test Subject",
    content: { text: "Hello World!" },
  });

  try {
    await transport.send(message, { signal: controller.signal });
    assert.fail("Should have thrown AbortError");
  } catch (error) {
    assert.ok(error instanceof Error);
    assert.ok(error.name === "AbortError" || error.message.includes("abort"));
  }
});

test("SesTransport rejects caller aborts during fetch", async () => {
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();

  try {
    globalThis.fetch = (_url, options) =>
      new Promise((_resolve, reject) => {
        options?.signal?.addEventListener("abort", () => {
          reject(
            new DOMException("The operation was aborted.", "AbortError"),
          );
        }, { once: true });
        setTimeout(() => controller.abort(), 0);
      });

    const transport = new SesTransport({
      authentication: {
        type: "credentials",
        accessKeyId: "test-key",
        secretAccessKey: "test-secret",
      },
      retries: 0,
    });

    const message = createMessage({
      from: "sender@example.com",
      to: "recipient@example.com",
      subject: "Test Subject",
      content: { text: "Hello World!" },
    });

    await assert.rejects(
      () => transport.send(message, { signal: controller.signal }),
      (error: unknown) => error instanceof Error && error.name === "AbortError",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("SesTransport sendMany handles async iterables", async () => {
  const config: SesConfig = {
    authentication: {
      type: "credentials",
      accessKeyId: "test-key",
      secretAccessKey: "test-secret",
    },
  };

  const transport = new SesTransport(config);

  async function* messageGenerator() {
    for (let i = 0; i < 3; i++) {
      yield createMessage({
        from: "sender@example.com",
        to: `recipient${i}@example.com`,
        subject: `Message ${i}`,
        content: { text: `Hello ${i}!` },
      });
    }
  }

  const controller = new AbortController();
  controller.abort();

  const receipts: unknown[] = [];

  try {
    for await (
      const receipt of transport.sendMany(messageGenerator(), {
        signal: controller.signal,
      })
    ) {
      receipts.push(receipt);
    }
    assert.fail("Should have thrown AbortError");
  } catch (error) {
    assert.ok(error instanceof Error);
    assert.ok(error.name === "AbortError" || error.message.includes("abort"));
    assert.equal(receipts.length, 0);
  }
});

test("SesTransport sendMany handles sync iterables", async () => {
  const config: SesConfig = {
    authentication: {
      type: "credentials",
      accessKeyId: "test-key",
      secretAccessKey: "test-secret",
    },
  };

  const transport = new SesTransport(config);

  const messages = [
    createMessage({
      from: "sender@example.com",
      to: "recipient1@example.com",
      subject: "Message 1",
      content: { text: "Hello 1!" },
    }),
    createMessage({
      from: "sender@example.com",
      to: "recipient2@example.com",
      subject: "Message 2",
      content: { text: "Hello 2!" },
    }),
  ];

  const controller = new AbortController();
  controller.abort();

  const receipts: unknown[] = [];

  try {
    for await (
      const receipt of transport.sendMany(messages, {
        signal: controller.signal,
      })
    ) {
      receipts.push(receipt);
    }
    assert.fail("Should have thrown AbortError");
  } catch (error) {
    assert.ok(error instanceof Error);
    assert.ok(error.name === "AbortError" || error.message.includes("abort"));
    assert.equal(receipts.length, 0);
  }
});

test("SesTransport extractMessageId handles JSON response", () => {
  const config: SesConfig = {
    authentication: {
      type: "credentials",
      accessKeyId: "test-key",
      secretAccessKey: "test-secret",
    },
  };

  const transport = new SesTransport(config);

  // deno-lint-ignore no-explicit-any
  const extractMessageId = (transport as any).extractMessageId.bind(transport);

  const response = {
    statusCode: 200,
    body: '{"MessageId":"test-message-id-123"}',
    headers: {},
  };

  const messageId = extractMessageId(response);
  assert.equal(messageId, "test-message-id-123");
});

test("SesTransport extractMessageId handles header fallback", () => {
  const config: SesConfig = {
    authentication: {
      type: "credentials",
      accessKeyId: "test-key",
      secretAccessKey: "test-secret",
    },
  };

  const transport = new SesTransport(config);

  // deno-lint-ignore no-explicit-any
  const extractMessageId = (transport as any).extractMessageId.bind(transport);

  const response = {
    statusCode: 200,
    body: "",
    headers: { "x-amzn-requestid": "header-request-id-456" },
  };

  const messageId = extractMessageId(response);
  assert.equal(messageId, "header-request-id-456");
});

test("SesTransport extractMessageId generates synthetic ID", () => {
  const config: SesConfig = {
    authentication: {
      type: "credentials",
      accessKeyId: "test-key",
      secretAccessKey: "test-secret",
    },
  };

  const transport = new SesTransport(config);

  // deno-lint-ignore no-explicit-any
  const extractMessageId = (transport as any).extractMessageId.bind(transport);

  const response = {
    statusCode: 200,
    body: "",
    headers: {},
  };

  const messageId = extractMessageId(response);
  assert.ok(messageId.startsWith("ses-"));
  assert.ok(messageId.length > 10);
});

test("SesTransport returns structured API failures", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = () =>
      Promise.resolve(
        new Response(
          JSON.stringify({ message: "Too Many Requests" }),
          {
            status: 429,
            headers: { "Retry-After": "60" },
          },
        ),
      );

    const transport = new SesTransport({
      authentication: {
        type: "credentials",
        accessKeyId: "test-key",
        secretAccessKey: "test-secret",
      },
      retries: 0,
    });

    const receipt = await transport.send(createMessage({
      from: "sender@example.com",
      to: "recipient@example.com",
      subject: "Test Subject",
      content: { text: "Hello World!" },
    }));

    assert.ok(!receipt.successful);
    if (!receipt.successful) {
      assert.equal(receipt.provider, "ses");
      assert.ok(receipt.retryable);
      assert.equal(receipt.attempts, 1);
      assert.equal(receipt.errors?.[0]?.category, "rate-limit");
      assert.equal(receipt.errors?.[0]?.statusCode, 429);
      assert.equal(receipt.errors?.[0]?.retryAfterMilliseconds, 60_000);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

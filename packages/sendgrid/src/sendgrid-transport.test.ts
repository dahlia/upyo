import type { Message } from "@upyo/core";
import { SendGridTransport } from "@upyo/sendgrid";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

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

describe("SendGridTransport", { concurrency: false }, () => {
  const basicMessage: Message = {
    sender: { address: "from@example.com" },
    recipients: [{ address: "to@example.com" }],
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

  it("should create a transport instance", () => {
    const transport = new SendGridTransport({
      apiKey: "SG.test-key",
    });
    assert.ok(transport);
    assert.equal(transport.config.apiKey, "SG.test-key");
    assert.equal(transport.config.baseUrl, "https://api.sendgrid.com/v3");
    assert.equal(transport.config.timeout, 30000);
    assert.equal(transport.config.retries, 3);
  });

  it("should create config with custom values", () => {
    const transport = new SendGridTransport({
      apiKey: "SG.custom-key",
      baseUrl: "https://custom.sendgrid.com/v3",
      timeout: 5000,
      retries: 1,
      clickTracking: false,
      openTracking: false,
    });

    assert.equal(transport.config.apiKey, "SG.custom-key");
    assert.equal(transport.config.baseUrl, "https://custom.sendgrid.com/v3");
    assert.equal(transport.config.timeout, 5000);
    assert.equal(transport.config.retries, 1);
    assert.equal(transport.config.clickTracking, false);
    assert.equal(transport.config.openTracking, false);
  });

  it("should handle abort signal", async () => {
    const controller = new AbortController();
    controller.abort();

    const transport = new SendGridTransport({
      apiKey: "SG.test-key",
    });

    try {
      await transport.send(basicMessage, { signal: controller.signal });
      assert.fail("Should have thrown AbortError");
    } catch (error) {
      assert.ok(error instanceof Error);
      assert.ok(
        error.name === "AbortError" || error.message.includes("aborted"),
      );
    }
  });

  it("should validate message structure in sendMany", async () => {
    const transport = new SendGridTransport({
      apiKey: "SG.test-key",
    });

    const messages = [basicMessage, basicMessage];

    // sendMany는 AsyncIterable을 반환해야 함
    const iterator = transport.sendMany(messages);
    assert.ok(Symbol.asyncIterator in iterator);

    // AbortController로 즉시 중단하여 실제 네트워크 요청 방지
    const controller = new AbortController();
    controller.abort();

    try {
      const receipts = [];
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
      assert.ok(
        error.name === "AbortError" || error.message.includes("aborted"),
      );
    }
  });

  it("should expose structured API error metadata", async () => {
    await withMockedFetch(
      () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              message: "Too Many Requests",
              errors: [{ message: "Rate limit exceeded" }],
            }),
            {
              status: 429,
              headers: { "Retry-After": "30" },
            },
          ),
        ),
      async () => {
        const transport = new SendGridTransport({
          apiKey: "SG.test-key",
          retries: 0,
        });

        const receipt = await transport.send(basicMessage);

        assert.equal(receipt.successful, false);
        if (!receipt.successful) {
          assert.deepEqual(receipt.errorMessages, ["Too Many Requests"]);
          assert.equal(receipt.provider, "sendgrid");
          assert.equal(receipt.retryable, true);
          assert.equal(receipt.attempts, 1);
          assert.equal(receipt.errors?.[0]?.category, "rate-limit");
          assert.equal(receipt.errors?.[0]?.code, "http.429");
          assert.equal(receipt.errors?.[0]?.statusCode, 429);
          assert.equal(receipt.errors?.[0]?.retryAfterMilliseconds, 30_000);
        }
      },
    );
  });

  it("should expose structured network error metadata", async () => {
    await withMockedFetch(
      () => {
        throw new TypeError("fetch failed");
      },
      async () => {
        const transport = new SendGridTransport({
          apiKey: "SG.test-key",
          retries: 0,
        });

        const receipt = await transport.send(basicMessage);

        assert.equal(receipt.successful, false);
        if (!receipt.successful) {
          assert.equal(receipt.provider, "sendgrid");
          assert.equal(receipt.retryable, true);
          assert.equal(receipt.errors?.[0]?.category, "network");
        }
      },
    );
  });

  // 네트워크 테스트는 E2E 테스트 파일에서 환경 변수와 함께 실행
  // src/sendgrid-transport.e2e.test.ts에서 실제 SendGrid API 연동 테스트 수행
});

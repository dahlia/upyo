import type { Message } from "@upyo/core";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SendGridTransport } from "./sendgrid-transport.ts";

describe("SendGridTransport", () => {
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

  // 네트워크 테스트는 E2E 테스트 파일에서 환경 변수와 함께 실행
  // src/sendgrid-transport.e2e.test.ts에서 실제 SendGrid API 연동 테스트 수행
});

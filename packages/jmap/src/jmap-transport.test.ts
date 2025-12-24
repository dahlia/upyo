import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import type { Message, Priority } from "@upyo/core";
import { JmapTransport } from "./jmap-transport.ts";

const baseMessage: Message = {
  sender: { address: "sender@example.com" as `${string}@${string}` },
  recipients: [
    { address: "recipient@example.com" as `${string}@${string}` },
  ],
  ccRecipients: [],
  bccRecipients: [],
  replyRecipients: [],
  attachments: [],
  subject: "Test Subject",
  content: { text: "Hello, World!" },
  priority: "normal" as Priority,
  tags: [],
  headers: new Headers(),
};

describe("JmapTransport", () => {
  describe("constructor", () => {
    it("should create transport with config", () => {
      const transport = new JmapTransport({
        sessionUrl: "https://jmap.example.com/.well-known/jmap",
        bearerToken: "test-token",
      });

      assert.ok(transport);
      assert.equal(
        transport.config.sessionUrl,
        "https://jmap.example.com/.well-known/jmap",
      );
    });
  });

  describe("send", () => {
    it("should respect abort signal", async () => {
      const controller = new AbortController();
      controller.abort();

      const transport = new JmapTransport({
        sessionUrl: "https://jmap.example.com/.well-known/jmap",
        bearerToken: "test-token",
      });

      const receipt = await transport.send(baseMessage, {
        signal: controller.signal,
      });

      assert.equal(receipt.successful, false);
      if (!receipt.successful) {
        assert.ok(
          receipt.errorMessages.some(
            (m: string) => m.includes("abort") || m.includes("Abort"),
          ),
        );
      }
    });
  });
});

// Note: Complex tests with fetch mocking are in separate files:
// - send-success.test.ts (successful send test)
// - send-error.test.ts (error handling test)
// - sendmany.test.ts (sendMany tests)
// This avoids test interference issues with globalThis.fetch mocking

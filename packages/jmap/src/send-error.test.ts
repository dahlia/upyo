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

describe("JmapTransport send error", () => {
  it("should return failed receipt on error", async () => {
    const originalFetch = globalThis.fetch;

    try {
      globalThis.fetch = () => {
        return Promise.resolve(new Response("Unauthorized", { status: 401 }));
      };

      const transport = new JmapTransport({
        sessionUrl: "https://jmap.example.com/.well-known/jmap",
        bearerToken: "test-token",
        retries: 0,
      });

      const receipt = await transport.send(baseMessage);

      assert.equal(receipt.successful, false);
      if (!receipt.successful) {
        assert.ok(receipt.errorMessages.length > 0);
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

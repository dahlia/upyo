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

describe("JmapTransport retry attempts", () => {
  it("should preserve attempt counts from retried network failures", async () => {
    const originalFetch = globalThis.fetch;

    try {
      globalThis.fetch = (
        input: RequestInfo | URL,
        init?: RequestInit,
      ): Promise<Response> => {
        const url = typeof input === "string"
          ? input
          : input instanceof URL
          ? input.href
          : input.url;
        const body = init?.body == null
          ? undefined
          : JSON.parse(init.body as string);

        if (url.includes(".well-known/jmap")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                capabilities: {},
                accounts: {
                  "acc-1": {
                    name: "Test",
                    isPersonal: true,
                    isReadOnly: false,
                    accountCapabilities: {
                      "urn:ietf:params:jmap:mail": {},
                    },
                  },
                },
                primaryAccounts: {},
                username: "test@example.com",
                apiUrl: "https://jmap.example.com/api",
                downloadUrl: "https://jmap.example.com/download/{blobId}",
                uploadUrl: "https://jmap.example.com/upload/{accountId}",
                state: "123",
              }),
              { status: 200 },
            ),
          );
        }

        if (body?.methodCalls?.[0]?.[0] === "Mailbox/get") {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                methodResponses: [
                  ["Mailbox/get", {
                    list: [{
                      id: "drafts-123",
                      role: "drafts",
                      name: "Drafts",
                    }],
                  }, "c0"],
                ],
              }),
              { status: 200 },
            ),
          );
        }

        if (body?.methodCalls?.[0]?.[0] === "Identity/get") {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                methodResponses: [
                  ["Identity/get", {
                    list: [{
                      id: "identity-123",
                      email: "sender@example.com",
                      name: "Sender",
                    }],
                  }, "c0"],
                ],
              }),
              { status: 200 },
            ),
          );
        }

        return Promise.reject(new TypeError("fetch failed"));
      };

      const transport = new JmapTransport({
        sessionUrl: "https://jmap.example.com/.well-known/jmap",
        bearerToken: "test-token",
        retries: 1,
      });

      const receipt = await transport.send(baseMessage);

      assert.ok(!receipt.successful);
      assert.equal(receipt.attempts, 2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

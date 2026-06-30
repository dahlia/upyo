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
        assert.equal(receipt.provider, "jmap");
        assert.equal(receipt.retryable, false);
        assert.equal(receipt.errors?.[0]?.category, "auth");
        assert.equal(receipt.errors?.[0]?.statusCode, 401);
        assert.deepEqual(receipt.errors?.[0]?.providerDetails, {
          responseBody: "Unauthorized",
          jmapErrorType: undefined,
        });
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should return retryable timeout receipts for request timeouts", async () => {
    const originalFetch = globalThis.fetch;

    try {
      let fetchCount = 0;
      globalThis.fetch = (
        input: RequestInfo | URL,
        init?: RequestInit,
      ): Promise<Response> => {
        fetchCount++;
        const url = typeof input === "string"
          ? input
          : input instanceof URL
          ? input.href
          : input.url;

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
                    accountCapabilities: { "urn:ietf:params:jmap:mail": {} },
                  },
                },
                primaryAccounts: { "urn:ietf:params:jmap:mail": "acc-1" },
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

        if (fetchCount === 2) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                methodResponses: [
                  [
                    "Mailbox/get",
                    {
                      list: [
                        { id: "drafts-123", role: "drafts", name: "Drafts" },
                      ],
                    },
                    "c0",
                  ],
                ],
              }),
              { status: 200 },
            ),
          );
        }

        if (fetchCount === 3) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                methodResponses: [
                  [
                    "Identity/get",
                    {
                      list: [
                        {
                          id: "id-1",
                          email: "sender@example.com",
                          name: "Sender",
                        },
                      ],
                    },
                    "c0",
                  ],
                ],
              }),
              { status: 200 },
            ),
          );
        }

        return new Promise((_resolve, reject) => {
          assert.ok(init?.signal instanceof AbortSignal);
          init.signal.addEventListener("abort", () => {
            reject(init.signal?.reason);
          }, { once: true });
        });
      };

      const transport = new JmapTransport({
        sessionUrl: "https://jmap.example.com/.well-known/jmap",
        bearerToken: "test-token",
        retries: 0,
        timeout: 1,
      });

      const receipt = await transport.send(baseMessage);

      assert.ok(!receipt.successful);
      if (!receipt.successful) {
        assert.equal(receipt.provider, "jmap");
        assert.equal(receipt.retryable, true);
        assert.equal(receipt.errors?.[0]?.category, "timeout");
        assert.equal(receipt.errors?.[0]?.retryable, true);
        assert.equal(receipt.errors?.[0]?.code, "timeout");
        assert.equal(receipt.errors?.[0]?.provider, "jmap");
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

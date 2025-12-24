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

describe("sendMany isolated", () => {
  it("should yield receipts for each message", async () => {
    const originalFetch = globalThis.fetch;

    try {
      const fetchInfo: { count: number } = { count: 0 };
      globalThis.fetch = async (
        input: RequestInfo | URL,
        _init?: RequestInit,
      ) => {
        fetchInfo.count++;
        const url = typeof input === "string"
          ? input
          : input instanceof URL
          ? input.href
          : input.url;

        if (url.includes(".well-known/jmap")) {
          return new Response(
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
              primaryAccounts: {},
              username: "test@example.com",
              apiUrl: "https://jmap.example.com/api",
              downloadUrl: "https://jmap.example.com/download/{blobId}",
              uploadUrl: "https://jmap.example.com/upload/{accountId}",
              state: "123",
            }),
            { status: 200 },
          );
        }

        // Mailbox/get
        if (fetchInfo.count === 2 || fetchInfo.count === 5) {
          return new Response(
            JSON.stringify({
              methodResponses: [
                ["Mailbox/get", { list: [{ id: "drafts-123", role: "drafts", name: "Drafts" }] }, "c0"],
              ],
            }),
            { status: 200 },
          );
        }

        // Identity/get
        if (fetchInfo.count === 3 || fetchInfo.count === 6) {
          return new Response(
            JSON.stringify({
              methodResponses: [
                ["Identity/get", { list: [{ id: "id-1", email: "sender@example.com", name: "Sender" }] }, "c0"],
              ],
            }),
            { status: 200 },
          );
        }

        // Email/set + EmailSubmission/set
        return new Response(
          JSON.stringify({
            methodResponses: [
              ["Email/set", { created: { draft: { id: `email-${fetchInfo.count}` } } }, "c0"],
              ["EmailSubmission/set", { created: { submission: { id: `sub-${fetchInfo.count}` } } }, "c1"],
            ],
          }),
          { status: 200 },
        );
      };

      const transport = new JmapTransport({
        sessionUrl: "https://jmap.example.com/.well-known/jmap",
        bearerToken: "test-token",
        retries: 0,
        timeout: 1000,
      });

      const messages = [
        { ...baseMessage, subject: "Test 1" },
        { ...baseMessage, subject: "Test 2" },
      ];

      const receipts: Awaited<ReturnType<typeof transport.send>>[] = [];
      for await (const receipt of transport.sendMany(messages)) {
        receipts.push(receipt);
      }

      assert.equal(receipts.length, 2);
      assert.ok(receipts.every((r) => r.successful));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

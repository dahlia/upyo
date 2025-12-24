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

describe("sendMany batch - success", () => {
  it("should batch multiple messages into a single JMAP request", async () => {
    const originalFetch = globalThis.fetch;

    try {
      const requests: { url: string; body: unknown }[] = [];
      globalThis.fetch = (
        input: RequestInfo | URL,
        init?: RequestInit,
      ): Promise<Response> => {
        const url = typeof input === "string"
          ? input
          : input instanceof URL
          ? input.href
          : input.url;

        const body = init?.body ? JSON.parse(init.body as string) : null;
        requests.push({ url, body });

        // Session fetch
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

        // Mailbox/get
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

        // Identity/get
        if (body?.methodCalls?.[0]?.[0] === "Identity/get") {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                methodResponses: [
                  ["Identity/get", {
                    list: [{
                      id: "id-1",
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

        // Batch Email/set + EmailSubmission/set
        if (body?.methodCalls?.[0]?.[0] === "Email/set") {
          const emailCreates = body.methodCalls[0][1].create;
          const createdEmails: Record<string, { id: string }> = {};
          for (const key of Object.keys(emailCreates)) {
            createdEmails[key] = { id: `email-${key}` };
          }

          const submissionCreates = body.methodCalls[1][1].create;
          const createdSubmissions: Record<string, { id: string }> = {};
          for (const key of Object.keys(submissionCreates)) {
            createdSubmissions[key] = { id: `submission-${key}` };
          }

          return Promise.resolve(
            new Response(
              JSON.stringify({
                methodResponses: [
                  ["Email/set", { created: createdEmails }, "c0"],
                  [
                    "EmailSubmission/set",
                    { created: createdSubmissions },
                    "c1",
                  ],
                ],
              }),
              { status: 200 },
            ),
          );
        }

        return Promise.resolve(new Response("Not found", { status: 404 }));
      };

      const transport = new JmapTransport({
        sessionUrl: "https://jmap.example.com/.well-known/jmap",
        bearerToken: "test-token",
        retries: 0,
        timeout: 5000,
      });

      const messages = [
        { ...baseMessage, subject: "Test 1" },
        { ...baseMessage, subject: "Test 2" },
        { ...baseMessage, subject: "Test 3" },
      ];

      const receipts: Awaited<ReturnType<typeof transport.send>>[] = [];
      for await (const receipt of transport.sendMany(messages)) {
        receipts.push(receipt);
      }

      // Verify all receipts are successful
      assert.equal(receipts.length, 3);
      assert.ok(receipts.every((r) => r.successful));

      // Verify batch request structure:
      // 1. Session fetch
      // 2. Mailbox/get (once)
      // 3. Identity/get (once)
      // 4. Batch Email/set + EmailSubmission/set (once for all messages)
      assert.equal(requests.length, 4, "Should make exactly 4 requests");

      // Verify the batch request has all 3 emails
      const batchRequest = requests[3];
      // deno-lint-ignore no-explicit-any
      const batchBody = batchRequest.body as any;
      const emailCreates = batchBody?.methodCalls?.[0]?.[1]?.create;
      assert.equal(
        Object.keys(emailCreates).length,
        3,
        "Email/set should have 3 creates",
      );
      assert.ok("draft0" in emailCreates);
      assert.ok("draft1" in emailCreates);
      assert.ok("draft2" in emailCreates);

      // Verify submission creates reference the correct email IDs
      const submissionCreates = batchBody?.methodCalls?.[1]?.[1]?.create;
      assert.equal(
        Object.keys(submissionCreates).length,
        3,
        "EmailSubmission/set should have 3 creates",
      );
      assert.equal(submissionCreates.sub0.emailId, "#draft0");
      assert.equal(submissionCreates.sub1.emailId, "#draft1");
      assert.equal(submissionCreates.sub2.emailId, "#draft2");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("sendMany batch - partial failure", () => {
  it("should handle partial failures in batch", async () => {
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

        const body = init?.body ? JSON.parse(init.body as string) : null;

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
                    list: [{ id: "id-1", email: "sender@example.com" }],
                  }, "c0"],
                ],
              }),
              { status: 200 },
            ),
          );
        }

        // Batch with partial failure: draft1 fails
        if (body?.methodCalls?.[0]?.[0] === "Email/set") {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                methodResponses: [
                  ["Email/set", {
                    created: {
                      draft0: { id: "email-0" },
                      draft2: { id: "email-2" },
                    },
                    notCreated: {
                      draft1: {
                        type: "invalidProperties",
                        description: "Invalid recipient",
                      },
                    },
                  }, "c0"],
                  ["EmailSubmission/set", {
                    created: {
                      sub0: { id: "submission-0" },
                      sub2: { id: "submission-2" },
                    },
                    notCreated: {
                      sub1: {
                        type: "invalidEmail",
                        description: "Email not created",
                      },
                    },
                  }, "c1"],
                ],
              }),
              { status: 200 },
            ),
          );
        }

        return Promise.resolve(new Response("Not found", { status: 404 }));
      };

      const transport = new JmapTransport({
        sessionUrl: "https://jmap.example.com/.well-known/jmap",
        bearerToken: "test-token",
        retries: 0,
        timeout: 5000,
      });

      const messages = [
        { ...baseMessage, subject: "Test 1" },
        { ...baseMessage, subject: "Test 2" },
        { ...baseMessage, subject: "Test 3" },
      ];

      const receipts: Awaited<ReturnType<typeof transport.send>>[] = [];
      for await (const receipt of transport.sendMany(messages)) {
        receipts.push(receipt);
      }

      assert.equal(receipts.length, 3);

      // First message: success
      assert.ok(receipts[0].successful);
      assert.equal(
        (receipts[0] as { messageId: string }).messageId,
        "submission-0",
      );

      // Second message: failure
      assert.ok(!receipts[1].successful);
      const failedReceipt = receipts[1] as {
        successful: false;
        errorMessages: readonly string[];
      };
      assert.ok(
        failedReceipt.errorMessages.some((e) =>
          e.includes("invalidProperties")
        ),
      );

      // Third message: success
      assert.ok(receipts[2].successful);
      assert.equal(
        (receipts[2] as { messageId: string }).messageId,
        "submission-2",
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("sendMany batch - empty", () => {
  it("should yield empty for no messages", async () => {
    const transport = new JmapTransport({
      sessionUrl: "https://jmap.example.com/.well-known/jmap",
      bearerToken: "test-token",
    });

    const receipts: Awaited<ReturnType<typeof transport.send>>[] = [];
    for await (const receipt of transport.sendMany([])) {
      receipts.push(receipt);
    }

    assert.equal(receipts.length, 0);
  });
});

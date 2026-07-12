import type { Message } from "@upyo/core";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MailtrapTransport } from "./mailtrap-transport.ts";

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

describe("MailtrapTransport - Send Message", () => {
  it("should send a message successfully", async () => {
    const originalFetch = globalThis.fetch;
    try {
      // deno-lint-ignore require-await
      globalThis.fetch = async (input, init) => {
        assert.equal(
          input,
          "https://send.api.mailtrap.io/api/send",
        );
        const headers = new Headers(init?.headers);
        assert.equal(headers.get("Api-Token"), "test-token");
        assert.equal(headers.get("User-Agent"), "@upyo/mailtrap");

        return new Response(
          JSON.stringify({
            success: true,
            message_ids: ["test-message-id"],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      };

      const transport = new MailtrapTransport({
        apiToken: "test-token",
      });

      const receipt = await transport.send(createMessage());

      assert.equal(receipt.successful, true);
      if (receipt.successful) {
        assert.equal(receipt.messageId, "test-message-id");
        assert.equal(receipt.provider, "mailtrap");
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("exposes the mailtrap provider id", () => {
    const transport = new MailtrapTransport({ apiToken: "test-token" });
    assert.equal(transport.id, "mailtrap");
  });
});

describe("MailtrapTransport - Sandbox URL", () => {
  it("should use sandbox endpoint when configured", async () => {
    const originalFetch = globalThis.fetch;
    try {
      // deno-lint-ignore require-await
      globalThis.fetch = async (input) => {
        assert.equal(
          input,
          "https://sandbox.api.mailtrap.io/api/send/12345",
        );

        return new Response(
          JSON.stringify({
            success: true,
            message_ids: ["sandbox-message-id"],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      };

      const transport = new MailtrapTransport({
        apiToken: "test-token",
        sandbox: true,
        inboxId: 12345,
      });

      const receipt = await transport.send(createMessage());

      assert.equal(receipt.successful, true);
      if (receipt.successful) {
        assert.equal(receipt.messageId, "sandbox-message-id");
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("MailtrapTransport - API Errors", () => {
  it("should handle API errors", async () => {
    const originalFetch = globalThis.fetch;
    try {
      // deno-lint-ignore require-await
      globalThis.fetch = async () => {
        return new Response(
          JSON.stringify({
            errors: ["Invalid API token"],
          }),
          {
            status: 401,
            headers: { "Content-Type": "application/json" },
          },
        );
      };

      const transport = new MailtrapTransport({
        apiToken: "invalid-token",
      });

      const receipt = await transport.send(createMessage());

      assert.equal(receipt.successful, false);
      if (!receipt.successful) {
        assert.match(receipt.errorMessages[0], /Invalid API token/);
        assert.equal(receipt.provider, "mailtrap");
        assert.equal(receipt.errors?.[0]?.statusCode, 401);
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should handle provider-reported send failures", async () => {
    const originalFetch = globalThis.fetch;
    try {
      // deno-lint-ignore require-await
      globalThis.fetch = async () => {
        return new Response(
          JSON.stringify({
            success: false,
            errors: ["Invalid from address"],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      };

      const transport = new MailtrapTransport({
        apiToken: "test-token",
      });

      const receipt = await transport.send(createMessage());

      assert.equal(receipt.successful, false);
      if (!receipt.successful) {
        assert.equal(receipt.errorMessages[0], "Invalid from address");
        assert.equal(receipt.provider, "mailtrap");
        assert.equal(receipt.errors?.[0]?.code, "mailtrap.unsuccessful");
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("MailtrapTransport - Batch Send", () => {
  it("should send a batch successfully", async () => {
    const originalFetch = globalThis.fetch;
    try {
      // deno-lint-ignore require-await
      globalThis.fetch = async (input, init) => {
        assert.equal(
          input,
          "https://send.api.mailtrap.io/api/batch",
        );

        const body = JSON.parse(String(init?.body));
        assert.equal(body.requests.length, 2);

        return new Response(
          JSON.stringify({
            success: true,
            responses: [
              { success: true, message_ids: ["id-1"] },
              { success: true, message_ids: ["id-2"] },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      };

      const transport = new MailtrapTransport({
        apiToken: "test-token",
      });

      const receipts = [];
      for await (
        const receipt of transport.sendMany([
          createMessage({ subject: "One" }),
          createMessage({ subject: "Two" }),
        ])
      ) {
        receipts.push(receipt);
      }

      assert.equal(receipts.length, 2);
      assert.equal(receipts[0]?.successful, true);
      assert.equal(receipts[1]?.successful, true);
      if (receipts[0]?.successful) {
        assert.equal(receipts[0].messageId, "id-1");
      }
      if (receipts[1]?.successful) {
        assert.equal(receipts[1].messageId, "id-2");
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should handle per-item batch failures", async () => {
    const originalFetch = globalThis.fetch;
    try {
      // deno-lint-ignore require-await
      globalThis.fetch = async () => {
        return new Response(
          JSON.stringify({
            success: true,
            responses: [
              { success: true, message_ids: ["id-1"] },
              { success: false, errors: ["Invalid recipient"] },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      };

      const transport = new MailtrapTransport({
        apiToken: "test-token",
      });

      const receipts = [];
      for await (
        const receipt of transport.sendMany([
          createMessage(),
          createMessage(),
        ])
      ) {
        receipts.push(receipt);
      }

      assert.equal(receipts[0]?.successful, true);
      assert.equal(receipts[1]?.successful, false);
      if (receipts[1] && !receipts[1].successful) {
        assert.equal(receipts[1].errorMessages[0], "Invalid recipient");
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

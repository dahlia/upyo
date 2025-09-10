import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { convertMessage } from "./message-converter.ts";
import { createPlunkConfig } from "./config.ts";
import type { Message } from "@upyo/core";

describe("convertMessage", () => {
  const config = createPlunkConfig({ apiKey: "test-key" });

  function createTestMessage(overrides: Partial<Message> = {}): Message {
    return {
      sender: { address: "from@example.com", name: "Sender Name" },
      recipients: [{ address: "to@example.com", name: "Recipient Name" }],
      ccRecipients: [],
      bccRecipients: [],
      replyRecipients: [],
      subject: "Test Subject",
      content: { text: "Test message content" },
      attachments: [],
      priority: "normal",
      tags: [],
      headers: new Headers(),
      ...overrides,
    };
  }

  it("should convert basic message fields", async () => {
    const message = createTestMessage();
    const result = await convertMessage(message, config);

    assert.equal(result.to, "to@example.com");
    assert.equal(result.subject, "Test Subject");
    assert.equal(result.body, "Test message content");
    assert.equal(result.subscribed, false);
    assert.equal(result.name, "Sender Name");
    assert.equal(result.from, "from@example.com");
  });

  it("should handle multiple recipients", async () => {
    const message = createTestMessage({
      recipients: [
        { address: "user1@example.com" },
        { address: "user2@example.com" },
        { address: "user3@example.com" },
      ],
    });

    const result = await convertMessage(message, config);

    assert.deepEqual(result.to, [
      "user1@example.com",
      "user2@example.com",
      "user3@example.com",
    ]);
  });

  it("should handle single recipient as string", async () => {
    const message = createTestMessage({
      recipients: [{ address: "single@example.com" }],
    });

    const result = await convertMessage(message, config);

    assert.equal(result.to, "single@example.com");
  });

  it("should prefer HTML content over text", async () => {
    const message = createTestMessage({
      content: {
        text: "Plain text content",
        html: "<h1>HTML content</h1>",
      },
    });

    const result = await convertMessage(message, config);

    assert.equal(result.body, "<h1>HTML content</h1>");
  });

  it("should use text content when HTML is not available", async () => {
    const message = createTestMessage({
      content: { text: "Plain text only" },
    });

    const result = await convertMessage(message, config);

    assert.equal(result.body, "Plain text only");
  });

  it("should handle empty content", async () => {
    const message = createTestMessage({
      content: { text: "" },
    });

    const result = await convertMessage(message, config);

    assert.equal(result.body, "");
  });

  it("should convert reply-to address", async () => {
    const message = createTestMessage({
      replyRecipients: [
        { address: "reply@example.com", name: "Reply Person" },
        { address: "noreply@example.com" }, // Should use first one
      ],
    });

    const result = await convertMessage(message, config);

    assert.equal(result.reply, "reply@example.com");
  });

  it("should not include reply field when no reply recipients", async () => {
    const message = createTestMessage({
      replyRecipients: [],
    });

    const result = await convertMessage(message, config);

    assert.equal(result.reply, undefined);
  });

  it("should convert custom headers", async () => {
    const headers = new Headers();
    headers.set("X-Custom-Header", "custom-value");
    headers.set("X-Source", "upyo");
    headers.set("To", "should-be-filtered"); // Should be filtered out
    headers.set("From", "should-be-filtered"); // Should be filtered out

    const message = createTestMessage({ headers });
    const result = await convertMessage(message, config);

    assert.deepEqual(result.headers, {
      "x-custom-header": "custom-value",
      "x-source": "upyo",
    });
  });

  it("should not include headers field when no custom headers", async () => {
    const message = createTestMessage();
    const result = await convertMessage(message, config);

    assert.equal(result.headers, undefined);
  });

  it("should filter out standard headers", async () => {
    const headers = new Headers();
    headers.set("content-type", "text/html");
    headers.set("subject", "filtered");
    headers.set("reply-to", "filtered");
    headers.set("X-Keep-This", "keep");

    const message = createTestMessage({ headers });
    const result = await convertMessage(message, config);

    assert.deepEqual(result.headers, {
      "x-keep-this": "keep",
    });
  });

  it("should convert attachments", async () => {
    const textContent = new TextEncoder().encode("Hello, attachment!");

    const message = createTestMessage({
      attachments: [
        {
          filename: "test.txt",
          contentType: "text/plain" as const,
          content: Promise.resolve(textContent),
          inline: false,
          contentId: "",
        },
      ],
    });

    const result = await convertMessage(message, config);

    assert.equal(result.attachments?.length, 1);
    assert.equal(result.attachments?.[0].filename, "test.txt");
    assert.equal(result.attachments?.[0].type, "text/plain");

    // Verify base64 encoding
    const expectedBase64 = btoa("Hello, attachment!");
    assert.equal(result.attachments?.[0].content, expectedBase64);
  });

  it("should limit attachments to 5", async () => {
    const content = new TextEncoder().encode("test");
    const attachments = Array.from({ length: 10 }, (_, i) => ({
      filename: `test${i}.txt`,
      contentType: "text/plain" as const,
      content: Promise.resolve(content),
      inline: false,
      contentId: "",
    }));

    const message = createTestMessage({ attachments });
    const result = await convertMessage(message, config);

    assert.equal(result.attachments?.length, 5);
  });

  it("should handle attachment conversion errors gracefully", async () => {
    const message = createTestMessage({
      attachments: [
        {
          filename: "failing.txt",
          contentType: "text/plain" as const,
          content: Promise.reject(new Error("Failed to read")),
          inline: false,
          contentId: "",
        },
        {
          filename: "working.txt",
          contentType: "text/plain" as const,
          content: Promise.resolve(new TextEncoder().encode("works")),
          inline: false,
          contentId: "",
        },
      ],
    });

    const result = await convertMessage(message, config);

    // Should only include the working attachment
    assert.equal(result.attachments?.length, 1);
    assert.equal(result.attachments?.[0].filename, "working.txt");
  });

  it("should not include optional fields when not present", async () => {
    const message = createTestMessage({
      sender: { address: "from@example.com" }, // No name
      replyRecipients: [],
      headers: new Headers(),
      attachments: [],
    });

    const result = await convertMessage(message, config);

    assert.equal(result.name, undefined);
    assert.equal(result.reply, undefined);
    assert.equal(result.headers, undefined);
    assert.equal(result.attachments, undefined);
  });

  it("should include sender name when provided", async () => {
    const message = createTestMessage({
      sender: { address: "from@example.com", name: "John Doe" },
    });

    const result = await convertMessage(message, config);

    assert.equal(result.name, "John Doe");
    assert.equal(result.from, "from@example.com");
  });
});

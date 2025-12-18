import type { Message } from "@upyo/core";
import {
  convertMessage,
  convertMessagesBatch,
  generateIdempotencyKey,
} from "./message-converter.ts";
import { createResendConfig } from "./config.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("Message Converter", () => {
  const config = createResendConfig({ apiKey: "test-key" });

  describe("convertMessage", () => {
    it("should convert basic message correctly", async () => {
      const message: Message = {
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
      };

      const result = await convertMessage(message, config);

      assert.equal(result.from, "sender@example.com");
      assert.equal(result.to, "recipient@example.com");
      assert.equal(result.subject, "Test Subject");
      assert.equal(result.text, "Test content");
      assert.equal(result.html, undefined);
    });

    it("should handle multiple recipients as array", async () => {
      const message: Message = {
        sender: { address: "sender@example.com" },
        recipients: [
          { address: "recipient1@example.com" },
          { address: "recipient2@example.com" },
        ],
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

      const result = await convertMessage(message, config);

      assert.deepEqual(result.to, [
        "recipient1@example.com",
        "recipient2@example.com",
      ]);
    });

    it("should format addresses with names correctly", async () => {
      const message: Message = {
        sender: { address: "sender@example.com", name: "John Doe" },
        recipients: [{ address: "recipient@example.com", name: "Jane Smith" }],
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

      const result = await convertMessage(message, config);

      assert.equal(result.from, "John Doe <sender@example.com>");
      assert.equal(result.to, "Jane Smith <recipient@example.com>");
    });

    it("should handle HTML content with text alternative", async () => {
      const message: Message = {
        sender: { address: "sender@example.com" },
        recipients: [{ address: "recipient@example.com" }],
        ccRecipients: [],
        bccRecipients: [],
        replyRecipients: [],
        subject: "Test Subject",
        content: {
          html: "<h1>Hello</h1>",
          text: "Hello",
        },
        attachments: [],
        priority: "normal",
        tags: [],
        headers: new Headers(),
      };

      const result = await convertMessage(message, config);

      assert.equal(result.html, "<h1>Hello</h1>");
      assert.equal(result.text, "Hello");
    });

    it("should handle CC and BCC recipients", async () => {
      const message: Message = {
        sender: { address: "sender@example.com" },
        recipients: [{ address: "recipient@example.com" }],
        ccRecipients: [{ address: "cc@example.com" }],
        bccRecipients: [{ address: "bcc@example.com" }],
        replyRecipients: [],
        subject: "Test Subject",
        content: { text: "Test content" },
        attachments: [],
        priority: "normal",
        tags: [],
        headers: new Headers(),
      };

      const result = await convertMessage(message, config);

      assert.deepEqual(result.cc, ["cc@example.com"]);
      assert.deepEqual(result.bcc, ["bcc@example.com"]);
    });

    it("should handle reply-to address", async () => {
      const message: Message = {
        sender: { address: "sender@example.com" },
        recipients: [{ address: "recipient@example.com" }],
        ccRecipients: [],
        bccRecipients: [],
        replyRecipients: [{ address: "reply@example.com" }],
        subject: "Test Subject",
        content: { text: "Test content" },
        attachments: [],
        priority: "normal",
        tags: [],
        headers: new Headers(),
      };

      const result = await convertMessage(message, config);

      assert.equal(result.reply_to, "reply@example.com");
    });

    it("should convert tags to Resend format", async () => {
      const message: Message = {
        sender: { address: "sender@example.com" },
        recipients: [{ address: "recipient@example.com" }],
        ccRecipients: [],
        bccRecipients: [],
        replyRecipients: [],
        subject: "Test Subject",
        content: { text: "Test content" },
        attachments: [],
        priority: "normal",
        tags: ["newsletter", "marketing"],
        headers: new Headers(),
      };

      const result = await convertMessage(message, config);

      assert.deepEqual(result.tags, [
        { name: "tag1", value: "newsletter" },
        { name: "tag2", value: "marketing" },
      ]);
    });

    it("should handle priority headers", async () => {
      const message: Message = {
        sender: { address: "sender@example.com" },
        recipients: [{ address: "recipient@example.com" }],
        ccRecipients: [],
        bccRecipients: [],
        replyRecipients: [],
        subject: "Test Subject",
        content: { text: "Test content" },
        attachments: [],
        priority: "high",
        tags: [],
        headers: new Headers(),
      };

      const result = await convertMessage(message, config);

      assert.equal(result.headers?.["X-Priority"], "1");
    });

    it("should handle custom headers", async () => {
      const headers = new Headers();
      headers.set("X-Custom-Header", "custom-value");
      headers.set("X-Another", "another-value");

      const message: Message = {
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
        headers,
      };

      const result = await convertMessage(message, config);

      assert.equal(result.headers?.["x-custom-header"], "custom-value");
      assert.equal(result.headers?.["x-another"], "another-value");
    });

    it("should handle scheduled sending", async () => {
      const scheduledDate = new Date("2024-12-01T10:00:00Z");
      const message: Message = {
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
      };

      const result = await convertMessage(message, config, {
        scheduledAt: scheduledDate,
      });

      assert.equal(result.scheduled_at, "2024-12-01T10:00:00.000Z");
    });
  });

  describe("convertMessagesBatch", () => {
    it("should convert multiple messages for batch API", async () => {
      const messages: Message[] = [
        {
          sender: { address: "sender@example.com" },
          recipients: [{ address: "recipient1@example.com" }],
          ccRecipients: [],
          bccRecipients: [],
          replyRecipients: [],
          subject: "Test Subject 1",
          content: { text: "Test content 1" },
          attachments: [],
          priority: "normal",
          tags: [],
          headers: new Headers(),
        },
        {
          sender: { address: "sender@example.com" },
          recipients: [{ address: "recipient2@example.com" }],
          ccRecipients: [],
          bccRecipients: [],
          replyRecipients: [],
          subject: "Test Subject 2",
          content: { text: "Test content 2" },
          attachments: [],
          priority: "normal",
          tags: [],
          headers: new Headers(),
        },
      ];

      const result = await convertMessagesBatch(messages, config);

      assert.equal(result.length, 2);
      assert.equal(result[0].subject, "Test Subject 1");
      assert.equal(result[1].subject, "Test Subject 2");
    });

    it("should reject batch with more than 100 messages", async () => {
      const messages: Message[] = Array(101).fill(null).map((_, i) => ({
        sender: { address: "sender@example.com" },
        recipients: [{ address: `recipient${i}@example.com` }],
        ccRecipients: [],
        bccRecipients: [],
        replyRecipients: [],
        subject: `Test Subject ${i}`,
        content: { text: `Test content ${i}` },
        attachments: [],
        priority: "normal" as const,
        tags: [],
        headers: new Headers(),
      }));

      await assert.rejects(
        () => convertMessagesBatch(messages, config),
        { message: "Resend batch API supports maximum 100 emails per request" },
      );
    });

    it("should reject batch with attachments", async () => {
      const message: Message = {
        sender: { address: "sender@example.com" },
        recipients: [{ address: "recipient@example.com" }],
        ccRecipients: [],
        bccRecipients: [],
        replyRecipients: [],
        subject: "Test Subject",
        content: { text: "Test content" },
        attachments: [{
          filename: "test.txt",
          content: new Uint8Array(10),
          contentType: "text/plain",
          inline: false,
          contentId: "",
        }],
        priority: "normal",
        tags: [],
        headers: new Headers(),
      };

      await assert.rejects(
        () => convertMessagesBatch([message], config),
        { message: "Attachments are not supported in Resend batch API" },
      );
    });

    it("should reject batch with tags", async () => {
      const message: Message = {
        sender: { address: "sender@example.com" },
        recipients: [{ address: "recipient@example.com" }],
        ccRecipients: [],
        bccRecipients: [],
        replyRecipients: [],
        subject: "Test Subject",
        content: { text: "Test content" },
        attachments: [],
        priority: "normal",
        tags: ["newsletter"],
        headers: new Headers(),
      };

      await assert.rejects(
        () => convertMessagesBatch([message], config),
        { message: "Tags are not supported in Resend batch API" },
      );
    });
  });

  describe("generateIdempotencyKey", () => {
    it("should generate unique keys", () => {
      const key1 = generateIdempotencyKey();
      const key2 = generateIdempotencyKey();

      assert.notEqual(key1, key2);
      assert.ok(key1.length > 10);
      assert.ok(key2.length > 10);
    });

    it("should generate keys with expected format", () => {
      const key = generateIdempotencyKey();

      // Should contain timestamp and random parts separated by hyphens
      const parts = key.split("-");
      assert.ok(parts.length >= 2);
      assert.ok(parts.every((part) => part.length > 0));
    });
  });
});

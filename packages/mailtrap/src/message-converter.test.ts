import type { Message } from "@upyo/core";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMailtrapConfig } from "./config.ts";
import { convertMessage } from "./message-converter.ts";

const baseConfig = createMailtrapConfig({ apiToken: "test-token" });

function createBaseMessage(overrides: Partial<Message> = {}): Message {
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

describe("convertMessage", () => {
  it("converts a basic text message", async () => {
    const result = await convertMessage(createBaseMessage(), baseConfig);

    assert.deepEqual(result.from, { email: "sender@example.com" });
    assert.deepEqual(result.to, [{ email: "recipient@example.com" }]);
    assert.equal(result.subject, "Test Subject");
    assert.equal(result.text, "Test content");
    assert.equal(result.html, undefined);
    assert.equal(result.category, "transactional");
  });

  it("formats addresses with names", async () => {
    const result = await convertMessage(
      createBaseMessage({
        sender: { address: "sender@example.com", name: "Sender Name" },
        recipients: [{
          address: "recipient@example.com",
          name: "Recipient Name",
        }],
      }),
      baseConfig,
    );

    assert.deepEqual(result.from, {
      email: "sender@example.com",
      name: "Sender Name",
    });
    assert.deepEqual(result.to, [{
      email: "recipient@example.com",
      name: "Recipient Name",
    }]);
  });

  it("converts HTML content with text alternative", async () => {
    const result = await convertMessage(
      createBaseMessage({
        content: { html: "<h1>Hello</h1>", text: "Hello" },
      }),
      baseConfig,
    );

    assert.equal(result.html, "<h1>Hello</h1>");
    assert.equal(result.text, "Hello");
  });

  it("handles CC, BCC, and reply-to recipients", async () => {
    const result = await convertMessage(
      createBaseMessage({
        ccRecipients: [{ address: "cc@example.com" }],
        bccRecipients: [{ address: "bcc@example.com" }],
        replyRecipients: [{ address: "reply@example.com" }],
      }),
      baseConfig,
    );

    assert.deepEqual(result.cc, [{ email: "cc@example.com" }]);
    assert.deepEqual(result.bcc, [{ email: "bcc@example.com" }]);
    assert.deepEqual(result.reply_to, { email: "reply@example.com" });
  });

  it("maps tags and metadata to category and custom variables", async () => {
    const config = createMailtrapConfig({
      apiToken: "test-token",
      metadata: { user_id: "123" },
    });

    const result = await convertMessage(
      createBaseMessage({ tags: ["newsletter", "welcome"] }),
      config,
    );

    assert.equal(result.category, "newsletter");
    assert.deepEqual(result.custom_variables, {
      user_id: "123",
      tag_welcome: "welcome",
    });
  });

  it("uses defaultCategory when message has no tags", async () => {
    const config = createMailtrapConfig({
      apiToken: "test-token",
      defaultCategory: "integration-test",
    });

    const result = await convertMessage(createBaseMessage(), config);

    assert.equal(result.category, "integration-test");
  });

  it("maps priority and custom headers", async () => {
    const result = await convertMessage(
      createBaseMessage({
        priority: "high",
        headers: new Headers({
          "X-Custom": "value",
          "Subject": "ignored",
        }),
      }),
      baseConfig,
    );

    assert.deepEqual(result.headers, {
      "X-Priority": "1",
      "x-custom": "value",
    });
  });

  it("converts attachments", async () => {
    const result = await convertMessage(
      createBaseMessage({
        attachments: [{
          inline: false,
          filename: "test.txt",
          content: Promise.resolve(new TextEncoder().encode("hello")),
          contentType: "text/plain",
          contentId: "cid@example.com",
        }],
      }),
      baseConfig,
    );

    assert.equal(result.attachments?.length, 1);
    assert.equal(result.attachments?.[0]?.filename, "test.txt");
    assert.equal(result.attachments?.[0]?.type, "text/plain");
    assert.equal(result.attachments?.[0]?.disposition, "attachment");
    assert.equal(result.attachments?.[0]?.content, btoa("hello"));
  });

  it("rejects messages without text or HTML content", async () => {
    await assert.rejects(
      () =>
        convertMessage(
          createBaseMessage({ content: { text: "" } }),
          baseConfig,
        ),
      {
        name: "RangeError",
        message: "Mailtrap requires at least one of text or HTML content.",
      },
    );
  });
});

import type { Message } from "@upyo/core";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMailerooConfig } from "./config.ts";
import { convertMessage } from "./message-converter.ts";

const baseConfig = createMailerooConfig({ apiKey: "test-key" });

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

    assert.deepEqual(result.from, { address: "sender@example.com" });
    assert.deepEqual(result.to, { address: "recipient@example.com" });
    assert.equal(result.subject, "Test Subject");
    assert.equal(result.plain, "Test content");
    assert.equal(result.html, undefined);
  });

  it("converts addresses with display names", async () => {
    const result = await convertMessage(
      createBaseMessage({
        sender: { address: "sender@example.com", name: "Sender Name" },
        recipients: [{
          address: "recipient@example.com",
          name: 'Recipient "Name"',
        }],
      }),
      baseConfig,
    );

    assert.deepEqual(result.from, {
      address: "sender@example.com",
      display_name: "Sender Name",
    });
    assert.deepEqual(result.to, {
      address: "recipient@example.com",
      display_name: 'Recipient "Name"',
    });
  });

  it("uses arrays for multiple recipients", async () => {
    const result = await convertMessage(
      createBaseMessage({
        recipients: [
          { address: "one@example.com" },
          { address: "two@example.com", name: "Two" },
        ],
      }),
      baseConfig,
    );

    assert.deepEqual(result.to, [
      { address: "one@example.com" },
      { address: "two@example.com", display_name: "Two" },
    ]);
  });

  it("converts HTML content with text alternative", async () => {
    const result = await convertMessage(
      createBaseMessage({
        content: { html: "<h1>Hello</h1>", text: "Hello" },
      }),
      baseConfig,
    );

    assert.equal(result.html, "<h1>Hello</h1>");
    assert.equal(result.plain, "Hello");
  });

  it("handles CC, BCC, and reply-to recipients", async () => {
    const result = await convertMessage(
      createBaseMessage({
        ccRecipients: [{ address: "cc@example.com" }],
        bccRecipients: [
          { address: "bcc1@example.com" },
          { address: "bcc2@example.com" },
        ],
        replyRecipients: [{ address: "reply@example.com" }],
      }),
      baseConfig,
    );

    assert.deepEqual(result.cc, { address: "cc@example.com" });
    assert.deepEqual(result.bcc, [
      { address: "bcc1@example.com" },
      { address: "bcc2@example.com" },
    ]);
    assert.deepEqual(result.reply_to, { address: "reply@example.com" });
  });

  it("applies Maileroo defaults from config", async () => {
    const config = createMailerooConfig({
      apiKey: "test-key",
      tracking: false,
      tags: {
        campaign: "welcome-2026",
        environment: "test",
      },
    });

    const result = await convertMessage(createBaseMessage(), config);

    assert.equal(result.tracking, false);
    assert.deepEqual(result.tags, {
      campaign: "welcome-2026",
      environment: "test",
    });
  });

  it("adds message tags as generated Maileroo tag keys", async () => {
    const config = createMailerooConfig({
      apiKey: "test-key",
      tags: { campaign: "default" },
    });

    const result = await convertMessage(
      createBaseMessage({ tags: ["one", "two"] }),
      config,
    );

    assert.deepEqual(result.tags, {
      campaign: "default",
      tag1: "one",
      tag2: "two",
    });
  });

  it("converts priority and custom headers", async () => {
    const headers = new Headers();
    headers.set("X-Custom-Header", "custom-value");
    headers.set("Subject", "ignored");

    const result = await convertMessage(
      createBaseMessage({
        priority: "high",
        headers,
      }),
      baseConfig,
    );

    assert.deepEqual(result.headers, {
      "X-Priority": "1",
      "x-custom-header": "custom-value",
    });
  });

  it("converts attachments to base64 with inline content IDs", async () => {
    const result = await convertMessage(
      createBaseMessage({
        attachments: [
          {
            filename: "hello.txt",
            content: new TextEncoder().encode("hello"),
            contentType: "text/plain",
            inline: false,
            contentId: "",
          },
          {
            filename: "logo.png",
            content: new Uint8Array([1, 2, 3]),
            contentType: "image/png",
            inline: true,
            contentId: "logo",
          },
        ],
      }),
      baseConfig,
    );

    assert.deepEqual(result.attachments, [
      {
        file_name: "hello.txt",
        content_type: "text/plain",
        content: "aGVsbG8=",
        inline: undefined,
      },
      {
        file_name: "logo",
        content_type: "image/png",
        content: "AQID",
        inline: true,
      },
    ]);
  });

  it("uses the filename for inline attachments without content IDs", async () => {
    const result = await convertMessage(
      createBaseMessage({
        attachments: [
          {
            filename: "logo.png",
            content: new Uint8Array([1, 2, 3]),
            contentType: "image/png",
            inline: true,
            contentId: "",
          },
        ],
      }),
      baseConfig,
    );

    assert.equal(result.attachments?.[0]?.file_name, "logo.png");
  });

  it("uses native Uint8Array base64 conversion when available", async () => {
    const content = new Uint8Array([1, 2, 3]);
    Object.defineProperty(content, "toBase64", {
      configurable: true,
      value(this: Uint8Array) {
        assert.deepEqual([...this], [1, 2, 3]);
        return "native-base64";
      },
    });

    const result = await convertMessage(
      createBaseMessage({
        attachments: [
          {
            filename: "native.bin",
            content,
            contentType: "application/octet-stream",
            inline: false,
            contentId: "",
          },
        ],
      }),
      baseConfig,
    );

    assert.equal(result.attachments?.[0]?.content, "native-base64");
  });
});

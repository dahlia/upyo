import type { Message } from "@upyo/core";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createLettermintConfig } from "./config.ts";
import { convertMessage, generateIdempotencyKey } from "./message-converter.ts";

const baseConfig = createLettermintConfig({ apiToken: "test-token" });

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

    assert.equal(result.from, "sender@example.com");
    assert.deepEqual(result.to, ["recipient@example.com"]);
    assert.equal(result.subject, "Test Subject");
    assert.equal(result.text, "Test content");
    assert.equal(result.html, undefined);
  });

  it("formats addresses with names", async () => {
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

    assert.equal(result.from, '"Sender Name" <sender@example.com>');
    assert.deepEqual(result.to, [
      '"Recipient \\"Name\\"" <recipient@example.com>',
    ]);
  });

  it("escapes backslashes in address display names", async () => {
    const result = await convertMessage(
      createBaseMessage({
        sender: {
          address: "sender@example.com",
          name: String.raw`Sender \ "Name"`,
        },
      }),
      baseConfig,
    );

    assert.equal(
      result.from,
      String.raw`"Sender \\ \"Name\"" <sender@example.com>`,
    );
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

    assert.deepEqual(result.cc, ["cc@example.com"]);
    assert.deepEqual(result.bcc, ["bcc@example.com"]);
    assert.deepEqual(result.reply_to, ["reply@example.com"]);
  });

  it("applies Lettermint defaults from config", async () => {
    const config = createLettermintConfig({
      apiToken: "test-token",
      route: "transactional",
      tag: "welcome",
      metadata: {
        user_id: "123",
        campaign_id: "welcome-2026",
      },
      settings: {
        trackOpens: false,
        trackClicks: true,
      },
    });

    const result = await convertMessage(createBaseMessage(), config);

    assert.equal(result.route, "transactional");
    assert.equal(result.tag, "welcome");
    assert.deepEqual(result.metadata, {
      user_id: "123",
      campaign_id: "welcome-2026",
    });
    assert.deepEqual(result.settings, {
      track_opens: false,
      track_clicks: true,
    });
  });

  it("lets a single message tag override config tag", async () => {
    const config = createLettermintConfig({
      apiToken: "test-token",
      tag: "default-tag",
    });

    const result = await convertMessage(
      createBaseMessage({ tags: ["message-tag"] }),
      config,
    );

    assert.equal(result.tag, "message-tag");
  });

  it("rejects messages with multiple tags", async () => {
    await assert.rejects(
      () =>
        convertMessage(
          createBaseMessage({ tags: ["one", "two"] }),
          baseConfig,
        ),
      {
        name: "RangeError",
        message: "Lettermint supports at most one tag per message.",
      },
    );
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
        filename: "hello.txt",
        content: "aGVsbG8=",
        content_type: "text/plain",
      },
      {
        filename: "logo.png",
        content: "AQID",
        content_type: "image/png",
        content_id: "logo",
      },
    ]);
  });

  it("preserves attachment content types with parameters", async () => {
    const result = await convertMessage(
      createBaseMessage({
        attachments: [
          {
            filename: "invite.ics",
            content: new TextEncoder().encode("BEGIN:VCALENDAR"),
            contentType:
              "text/calendar; method=REQUEST" as `${string}/${string}`,
            inline: false,
            contentId: "",
          },
        ],
      }),
      baseConfig,
    );

    assert.equal(
      result.attachments?.[0]?.content_type,
      "text/calendar; method=REQUEST",
    );
  });
});

describe("generateIdempotencyKey", () => {
  it("generates non-empty keys", () => {
    const key = generateIdempotencyKey();
    assert.match(
      key,
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });
});

import { createMessage } from "@upyo/core";
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

  it("propagates aborts while converting attachments", async () => {
    const controller = new AbortController();
    const reason = new Error("Stop converting Mailtrap message.");
    const content = new Promise<Uint8Array>(() => {});
    const conversion = convertMessage(
      createBaseMessage({
        attachments: [{
          inline: false,
          filename: "slow.txt",
          content,
          contentType: "text/plain",
          contentId: "",
        }],
      }),
      baseConfig,
      controller.signal,
    );

    controller.abort(reason);

    await assert.rejects(
      Promise.race([
        conversion,
        new Promise<never>((_resolve, reject) => {
          setTimeout(() => reject(new Error("Conversion did not abort.")), 50);
        }),
      ]),
      (error: unknown) => error === reason,
    );
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

const threadingConfig = createMailtrapConfig({ apiToken: "test-token" });

const headerOf = (headers: Record<string, string>, name: string) =>
  Object.entries(headers)
    .filter(([key]) => key.toLowerCase() === name.toLowerCase())
    .map(([, value]) => value);

describe("convertMessage() reply threading", () => {
  const base = {
    from: "sender@example.com",
    to: "recipient@example.com",
    subject: "Re: Your request",
    content: { text: "Thanks for getting in touch." },
  } as const;

  it("writes the typed threading fields", async () => {
    const message = createMessage({
      ...base,
      inReplyTo: "122@example.com",
      references: ["120@example.com", "121@example.com"],
    });
    const result = (await convertMessage(message, threadingConfig)).headers ??
      {};

    assert.deepEqual(headerOf(result, "In-Reply-To"), ["<122@example.com>"]);
    assert.deepEqual(headerOf(result, "References"), [
      "<120@example.com> <121@example.com>",
    ]);
  });

  it("prefers a typed field over a custom header", async () => {
    const message = createMessage({
      ...base,
      inReplyTo: ["typed@example.com"],
      headers: { "In-Reply-To": "<custom@example.com>" },
    });
    const result = (await convertMessage(message, threadingConfig)).headers ??
      {};

    assert.deepEqual(headerOf(result, "In-Reply-To"), ["<typed@example.com>"]);
  });

  it("lets an empty list suppress a custom header", async () => {
    const message = createMessage({
      ...base,
      inReplyTo: [],
      references: [],
      headers: {
        "In-Reply-To": "<custom@example.com>",
        "References": "<custom@example.com>",
      },
    });
    const result = (await convertMessage(message, threadingConfig)).headers ??
      {};

    assert.deepEqual(headerOf(result, "In-Reply-To"), []);
    assert.deepEqual(headerOf(result, "References"), []);
  });

  it("lets a custom header through when the field is unset", async () => {
    const message = createMessage({
      ...base,
      headers: { "In-Reply-To": "<custom@example.com>" },
    });
    const result = (await convertMessage(message, threadingConfig)).headers ??
      {};

    assert.deepEqual(headerOf(result, "In-Reply-To"), ["<custom@example.com>"]);
  });
});

const CALENDAR_ICS = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "METHOD:REQUEST",
  "BEGIN:VEVENT",
  "UID:1@example.com",
  "SUMMARY:Lunch",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n") + "\r\n";

/** The invitation content as the providers below carry it: Base64. */
const CALENDAR_BASE64 = btoa(CALENDAR_ICS);

const AGENDA_ATTACHMENT = {
  inline: false,
  filename: "agenda.txt",
  content: new TextEncoder().encode("agenda"),
  contentType: "text/plain" as const,
  contentId: "",
};

describe("convertMessage() calendar", () => {
  const invitation = (overrides: Partial<Message> = {}): Message =>
    createBaseMessage({
      calendar: { method: "REQUEST", content: CALENDAR_ICS },
      ...overrides,
    });

  it("should carry the calendar as an invite.ics attachment", async () => {
    const result = await convertMessage(invitation(), baseConfig);

    assert.equal(result.attachments?.length, 1);
    assert.equal(result.attachments?.[0].filename, "invite.ics");
    assert.equal(
      result.attachments?.[0].type,
      "text/calendar; charset=utf-8; method=REQUEST",
    );
    assert.equal(result.attachments?.[0].content, CALENDAR_BASE64);
    // An empty content ID keeps the part an ordinary attachment.
    assert.equal(result.attachments?.[0].disposition, "attachment");
  });

  it("should place the invitation ahead of the other attachments", async () => {
    const result = await convertMessage(
      invitation({ attachments: [AGENDA_ATTACHMENT] }),
      baseConfig,
    );

    assert.deepEqual(
      result.attachments?.map((attachment) => attachment.filename),
      ["invite.ics", "agenda.txt"],
    );
  });

  it("should reject calendar content that never passed createMessage()", async () => {
    await assert.rejects(
      () =>
        convertMessage(
          createBaseMessage({
            calendar: { method: "REQUEST", content: "not a calendar" },
          }),
          baseConfig,
        ),
      { name: "TypeError" },
    );
  });
});

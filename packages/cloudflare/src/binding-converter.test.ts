import { createMessage } from "@upyo/core";
import { convertBindingMessage } from "./binding-converter.ts";
import { CloudflareValidationError } from "./errors.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const base = {
  from: "sender@example.com",
  to: "a@example.com",
  subject: "Hi",
  content: { text: "x" },
} as const;

describe("convertBindingMessage addresses", () => {
  it("passes named addresses as objects and bare ones as strings", async () => {
    const data = await convertBindingMessage(createMessage({
      from: "Sender <sender@example.com>",
      to: ["Sykez <sykez@example.com>", "cloudflare@example.com"],
      cc: ["cc@example.com", "Cc Two <cc2@example.com>"],
      bcc: ["Bcc <bcc@example.com>"],
      replyTo: ["Reply <r@example.com>", "other@example.com"],
      subject: "Hi",
      content: { text: "x" },
    }));
    assert.deepEqual(data.from, {
      name: "Sender",
      email: "sender@example.com",
    });
    assert.deepEqual(data.to, [
      { name: "Sykez", email: "sykez@example.com" },
      "cloudflare@example.com",
    ]);
    assert.deepEqual(data.cc, [
      "cc@example.com",
      { name: "Cc Two", email: "cc2@example.com" },
    ]);
    assert.deepEqual(data.bcc, [{ name: "Bcc", email: "bcc@example.com" }]);
    // The binding takes a single reply-to address, so the first one is used.
    assert.deepEqual(data.replyTo, { name: "Reply", email: "r@example.com" });
  });

  it("keeps names with special characters as they are", async () => {
    const data = await convertBindingMessage(createMessage({
      ...base,
      to: { name: 'Support, "Team"', address: "quoted@example.com" },
    }));
    assert.deepEqual(data.to, [{
      name: 'Support, "Team"',
      email: "quoted@example.com",
    }]);
  });

  it("leaves out empty cc, bcc and reply-to", async () => {
    const data = await convertBindingMessage(createMessage(base));
    assert.deepEqual(data.from, "sender@example.com");
    assert.ok(!("cc" in data));
    assert.ok(!("bcc" in data));
    assert.ok(!("replyTo" in data));
    assert.ok(!("headers" in data));
    assert.ok(!("attachments" in data));
  });
});

describe("convertBindingMessage content", () => {
  it("sends text only", async () => {
    const data = await convertBindingMessage(createMessage(base));
    assert.equal(data.text, "x");
    assert.ok(!("html" in data));
  });

  it("sends HTML with an optional text alternative", async () => {
    const data = await convertBindingMessage(createMessage({
      ...base,
      content: { html: "<p>x</p>", text: "x" },
    }));
    assert.equal(data.html, "<p>x</p>");
    assert.equal(data.text, "x");
  });
});

describe("convertBindingMessage attachments", () => {
  it("passes raw bytes, not base64", async () => {
    const bytes = new TextEncoder().encode("hello");
    const data = await convertBindingMessage(createMessage({
      ...base,
      attachments: [{
        inline: false,
        contentId: "",
        filename: "a.txt",
        content: bytes,
        contentType: "text/plain",
      }],
    }));
    const attachment = data.attachments?.[0];
    assert.equal(attachment?.disposition, "attachment");
    assert.equal(attachment?.filename, "a.txt");
    assert.equal(attachment?.type, "text/plain");
    assert.ok(attachment?.content instanceof Uint8Array);
    assert.deepEqual([...attachment.content], [...bytes]);
    assert.ok(!("contentId" in attachment));
  });

  it("sends an inline image with its content ID", async () => {
    const data = await convertBindingMessage(createMessage({
      ...base,
      content: { html: '<img src="cid:logo">' },
      attachments: [{
        inline: true,
        contentId: "logo",
        filename: "logo.png",
        content: new Uint8Array([1, 2]),
        contentType: "image/png",
      }],
    }));
    const attachment = data.attachments?.[0];
    assert.equal(attachment?.disposition, "inline");
    assert.equal(
      attachment?.disposition === "inline" ? attachment.contentId : undefined,
      "logo",
    );
  });

  it("sends an inline part without a content ID as a regular attachment", async () => {
    const data = await convertBindingMessage(createMessage({
      ...base,
      attachments: [{
        inline: true,
        contentId: "",
        filename: "logo.png",
        content: new Uint8Array([1]),
        contentType: "image/png",
      }],
    }));
    assert.equal(data.attachments?.[0].disposition, "attachment");
    assert.ok(!("contentId" in (data.attachments?.[0] ?? {})));
  });

  it("carries a calendar as an invite.ics attachment first", async () => {
    const data = await convertBindingMessage(createMessage({
      ...base,
      calendar: {
        content: [
          "BEGIN:VCALENDAR",
          "VERSION:2.0",
          "PRODID:-//t//t//EN",
          "METHOD:REQUEST",
          "BEGIN:VEVENT",
          "UID:1@example.com",
          "DTSTAMP:20260101T000000Z",
          "DTSTART:20260102T000000Z",
          "SUMMARY:x",
          "END:VEVENT",
          "END:VCALENDAR",
        ].join("\r\n"),
      },
    }));
    assert.equal(data.attachments?.[0].filename, "invite.ics");
    assert.match(
      new TextDecoder().decode(data.attachments?.[0].content),
      /METHOD:REQUEST/,
    );
  });
});

describe("convertBindingMessage headers and checks", () => {
  it("passes custom, threading and priority headers", async () => {
    const data = await convertBindingMessage(createMessage({
      ...base,
      priority: "low",
      inReplyTo: "parent@example.com",
      headers: { "List-Unsubscribe": "<https://example.com/u>" },
    }));
    assert.deepEqual(data.headers, {
      "list-unsubscribe": "<https://example.com/u>",
      "In-Reply-To": "<parent@example.com>",
      "X-Priority": "5",
    });
  });

  it("applies the same checks as the REST API", async () => {
    await assert.rejects(
      convertBindingMessage(
        createMessage({ ...base, headers: { "Message-ID": "<x@y>" } }),
      ),
      (error: unknown) =>
        error instanceof CloudflareValidationError &&
        error.code === "cloudflare.header_not_allowed",
    );
    await assert.rejects(
      convertBindingMessage(createMessage({
        ...base,
        to: Array.from({ length: 51 }, (_, i) => `r${i}@example.com`),
      })),
      (error: unknown) =>
        error instanceof CloudflareValidationError &&
        error.code === "cloudflare.too_many_recipients",
    );
  });
});

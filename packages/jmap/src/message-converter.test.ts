import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import type { Address, Message, Priority } from "@upyo/core";
import { convertMessage, formatAddress } from "./message-converter.ts";

describe("formatAddress", () => {
  it("should format address with name", () => {
    const address: Address = {
      address: "test@example.com" as `${string}@${string}`,
      name: "Test User",
    };

    const result = formatAddress(address);

    assert.deepEqual(result, {
      email: "test@example.com",
      name: "Test User",
    });
  });

  it("should format address without name", () => {
    const address: Address = {
      address: "test@example.com" as `${string}@${string}`,
    };

    const result = formatAddress(address);

    assert.deepEqual(result, {
      email: "test@example.com",
    });
  });

  it("should omit name property if undefined", () => {
    const address: Address = {
      address: "test@example.com" as `${string}@${string}`,
      name: undefined,
    };

    const result = formatAddress(address);

    assert.equal("name" in result, false);
  });
});

describe("convertMessage", () => {
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

  it("should convert a basic text message", () => {
    const result = convertMessage(baseMessage, "drafts-123", new Map());

    assert.deepEqual(result.from, [{ email: "sender@example.com" }]);
    assert.deepEqual(result.to, [{ email: "recipient@example.com" }]);
    assert.equal(result.subject, "Test Subject");
    assert.deepEqual(result.mailboxIds, { "drafts-123": true });
    assert.ok("text" in result.bodyValues);
    assert.equal(result.bodyValues.text.value, "Hello, World!");
  });

  it("should convert a message with HTML content", () => {
    const message: Message = {
      ...baseMessage,
      content: { html: "<p>Hello, World!</p>" },
    };

    const result = convertMessage(message, "drafts-123", new Map());

    assert.ok("html" in result.bodyValues);
    assert.equal(result.bodyValues.html.value, "<p>Hello, World!</p>");
  });

  it("should convert a message with both text and HTML", () => {
    const message: Message = {
      ...baseMessage,
      content: { text: "Hello, World!", html: "<p>Hello, World!</p>" },
    };

    const result = convertMessage(message, "drafts-123", new Map());

    assert.ok("text" in result.bodyValues);
    assert.ok("html" in result.bodyValues);
    assert.equal(result.bodyStructure?.type, "multipart/alternative");
  });

  it("should add a calendar part carrying the method parameter", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "METHOD:REQUEST",
      "BEGIN:VEVENT",
      "UID:1@example.com",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n") + "\r\n";
    const message: Message = {
      ...baseMessage,
      content: { text: "Lunch on Wednesday." },
      calendar: { method: "REQUEST", content: ics },
    };

    const result = convertMessage(message, "drafts-123", new Map());

    assert.equal(result.bodyStructure?.type, "multipart/alternative");
    const parts = result.bodyStructure?.subParts ?? [];
    const calendarPart = parts[parts.length - 1];
    assert.equal(calendarPart.partId, "calendar");
    // The charset is left to the server, which appends its own.
    assert.equal(calendarPart.type, "text/calendar; method=REQUEST");
    assert.equal(calendarPart.charset, undefined);
    assert.equal(result.bodyValues.calendar.value, ics);
  });

  it("should place the calendar after the other alternatives", () => {
    const message: Message = {
      ...baseMessage,
      content: { text: "Lunch", html: "<p>Lunch</p>" },
      calendar: {
        method: "CANCEL",
        content: "BEGIN:VCALENDAR\r\nMETHOD:CANCEL\r\nEND:VCALENDAR\r\n",
      },
    };

    const result = convertMessage(message, "drafts-123", new Map());

    assert.deepEqual(
      (result.bodyStructure?.subParts ?? []).map((part) => part.partId),
      ["text", "html", "calendar"],
    );
  });

  it("should reject calendar content that never passed createMessage()", () => {
    const message: Message = {
      ...baseMessage,
      calendar: { method: "REQUEST", content: "not a calendar" },
    };

    assert.throws(() => convertMessage(message, "drafts-123", new Map()), {
      name: "TypeError",
    });
  });

  it("should convert cc and bcc recipients", () => {
    const message: Message = {
      ...baseMessage,
      ccRecipients: [
        { address: "cc@example.com" as `${string}@${string}`, name: "CC User" },
      ],
      bccRecipients: [
        { address: "bcc@example.com" as `${string}@${string}` },
      ],
    };

    const result = convertMessage(message, "drafts-123", new Map());

    assert.deepEqual(result.cc, [{ email: "cc@example.com", name: "CC User" }]);
    assert.deepEqual(result.bcc, [{ email: "bcc@example.com" }]);
  });

  it("should convert replyTo recipients", () => {
    const message: Message = {
      ...baseMessage,
      replyRecipients: [
        { address: "reply@example.com" as `${string}@${string}` },
      ],
    };

    const result = convertMessage(message, "drafts-123", new Map());

    assert.deepEqual(result.replyTo, [{ email: "reply@example.com" }]);
  });

  it("should add priority headers for high priority", () => {
    const message: Message = {
      ...baseMessage,
      priority: "high" as Priority,
    };

    const result = convertMessage(message, "drafts-123", new Map());

    assert.equal(result["header:X-Priority"], "1");
    assert.equal(result["header:Importance"], "high");
  });

  it("should add priority headers for low priority", () => {
    const message: Message = {
      ...baseMessage,
      priority: "low" as Priority,
    };

    const result = convertMessage(message, "drafts-123", new Map());

    assert.equal(result["header:X-Priority"], "5");
    assert.equal(result["header:Importance"], "low");
  });

  it("should not add priority headers for normal priority", () => {
    const result = convertMessage(baseMessage, "drafts-123", new Map());

    assert.equal(result["header:X-Priority"], undefined);
  });

  it("should include custom headers", () => {
    const headers = new Headers();
    headers.set("X-Custom-Header", "custom-value");

    const message: Message = {
      ...baseMessage,
      headers,
    };

    const result = convertMessage(message, "drafts-123", new Map());

    // Headers.entries() returns lowercase names per HTTP spec
    assert.equal(result["header:x-custom-header"], "custom-value");
    assert.ok(!("headers" in result));
  });

  it("should convert a message with attachments", () => {
    const message: Message = {
      ...baseMessage,
      attachments: [
        {
          inline: false,
          filename: "document.pdf",
          content: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
          contentType: "application/pdf" as `${string}/${string}`,
          contentId: "attachment-1",
        },
      ],
    };

    const uploadedBlobs = new Map<string, string>();
    uploadedBlobs.set("attachment-1", "blob-uploaded-123");

    const result = convertMessage(message, "drafts-123", uploadedBlobs);

    // Should be multipart/mixed when attachments are present
    assert.equal(result.bodyStructure?.type, "multipart/mixed");
    assert.ok(result.bodyStructure?.subParts);
    assert.equal(result.bodyStructure.subParts.length, 2);

    // First part should be the text content
    const textPart = result.bodyStructure.subParts[0];
    assert.equal(textPart.type, "text/plain; charset=utf-8");

    // Second part should be the attachment
    const attachmentPart = result.bodyStructure.subParts[1];
    assert.equal(attachmentPart.type, "application/pdf");
    assert.equal(attachmentPart.blobId, "blob-uploaded-123");
    assert.equal(attachmentPart.name, "document.pdf");
    assert.equal(attachmentPart.disposition, "attachment");
  });

  it("should convert a message with multiple attachments", () => {
    const message: Message = {
      ...baseMessage,
      content: { text: "Hello", html: "<p>Hello</p>" },
      attachments: [
        {
          inline: false,
          filename: "doc1.pdf",
          content: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
          contentType: "application/pdf" as `${string}/${string}`,
          contentId: "att-1",
        },
        {
          inline: false,
          filename: "image.png",
          content: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
          contentType: "image/png" as `${string}/${string}`,
          contentId: "att-2",
        },
      ],
    };

    const uploadedBlobs = new Map<string, string>();
    uploadedBlobs.set("att-1", "blob-1");
    uploadedBlobs.set("att-2", "blob-2");

    const result = convertMessage(message, "drafts-123", uploadedBlobs);

    // multipart/mixed with alternative body + 2 attachments
    assert.equal(result.bodyStructure?.type, "multipart/mixed");
    assert.ok(result.bodyStructure?.subParts);
    assert.equal(result.bodyStructure.subParts.length, 3);

    // First part should be multipart/alternative for text+html
    const alternativePart = result.bodyStructure.subParts[0];
    assert.equal(alternativePart.type, "multipart/alternative");

    // Second and third parts are attachments
    assert.equal(result.bodyStructure.subParts[1].blobId, "blob-1");
    assert.equal(result.bodyStructure.subParts[2].blobId, "blob-2");
  });

  it("should convert a message with inline attachments", () => {
    const message: Message = {
      ...baseMessage,
      content: { html: '<p>Hello</p><img src="cid:inline-img">' },
      attachments: [
        {
          inline: true,
          filename: "logo.png",
          content: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
          contentType: "image/png" as `${string}/${string}`,
          contentId: "inline-img",
        },
      ],
    };

    const uploadedBlobs = new Map<string, string>();
    uploadedBlobs.set("inline-img", "blob-inline-123");

    const result = convertMessage(message, "drafts-123", uploadedBlobs);

    // Should be multipart/related for HTML + inline images
    assert.equal(result.bodyStructure?.type, "multipart/related");
    assert.ok(result.bodyStructure?.subParts);
    assert.equal(result.bodyStructure.subParts.length, 2);

    // First part should be the HTML content
    const htmlPart = result.bodyStructure.subParts[0];
    assert.equal(htmlPart.type, "text/html; charset=utf-8");

    // Second part should be the inline image
    const inlinePart = result.bodyStructure.subParts[1];
    assert.equal(inlinePart.type, "image/png");
    assert.equal(inlinePart.blobId, "blob-inline-123");
    assert.equal(inlinePart.disposition, "inline");
    assert.equal(inlinePart.cid, "inline-img");
  });

  it("should convert a message with both inline and regular attachments", () => {
    const message: Message = {
      ...baseMessage,
      content: { text: "Hello", html: '<p>Hello</p><img src="cid:logo">' },
      attachments: [
        {
          inline: true,
          filename: "logo.png",
          content: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
          contentType: "image/png" as `${string}/${string}`,
          contentId: "logo",
        },
        {
          inline: false,
          filename: "document.pdf",
          content: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
          contentType: "application/pdf" as `${string}/${string}`,
          contentId: "att-doc",
        },
      ],
    };

    const uploadedBlobs = new Map<string, string>();
    uploadedBlobs.set("logo", "blob-logo");
    uploadedBlobs.set("att-doc", "blob-doc");

    const result = convertMessage(message, "drafts-123", uploadedBlobs);

    // multipart/mixed: [multipart/related, attachment]
    assert.equal(result.bodyStructure?.type, "multipart/mixed");
    assert.ok(result.bodyStructure?.subParts);
    assert.equal(result.bodyStructure.subParts.length, 2);

    // First part should be multipart/related (HTML + inline images)
    const relatedPart = result.bodyStructure.subParts[0];
    assert.equal(relatedPart.type, "multipart/related");
    assert.ok(relatedPart.subParts);
    assert.equal(relatedPart.subParts.length, 2);

    // Inside related: alternative body + inline attachment
    const alternativePart = relatedPart.subParts[0];
    assert.equal(alternativePart.type, "multipart/alternative");

    const inlinePart = relatedPart.subParts[1];
    assert.equal(inlinePart.disposition, "inline");
    assert.equal(inlinePart.cid, "logo");

    // Second part should be regular attachment
    const attachmentPart = result.bodyStructure.subParts[1];
    assert.equal(attachmentPart.disposition, "attachment");
    assert.equal(attachmentPart.blobId, "blob-doc");
  });
});

describe("convertMessage() identity and threading", () => {
  const base: Message = {
    sender: { address: "sender@example.com" },
    recipients: [{ address: "recipient@example.com" }],
    ccRecipients: [],
    bccRecipients: [],
    replyRecipients: [],
    subject: "Re: Your request",
    content: { text: "Thanks for getting in touch." },
    attachments: [],
    priority: "normal",
    tags: [],
    headers: new Headers(),
  };

  const convert = (overrides: Partial<Message> = {}) =>
    convertMessage({ ...base, ...overrides }, "drafts-123", new Map());

  it("sets the structured identity properties", () => {
    const result = convert({
      messageId: "ticket-4821@example.com",
      date: new Date("2026-09-01T10:00:00Z"),
      inReplyTo: ["122@example.com"],
      references: ["120@example.com", "121@example.com"],
    });

    assert.deepEqual(result.messageId, ["ticket-4821@example.com"]);
    assert.equal(result.sentAt, "2026-09-01T10:00:00Z");
    assert.deepEqual(result.inReplyTo, ["122@example.com"]);
    assert.deepEqual(result.references, [
      "120@example.com",
      "121@example.com",
    ]);
  });

  it("keeps a non-zero fractional second in the date", () => {
    const result = convert({ date: new Date("2026-09-01T10:00:00.250Z") });

    assert.equal(result.sentAt, "2026-09-01T10:00:00.250Z");
  });

  it("omits the properties a message does not set", () => {
    const result = convert();

    assert.equal(result.messageId, undefined);
    assert.equal(result.sentAt, undefined);
    assert.equal(result.inReplyTo, undefined);
    assert.equal(result.references, undefined);
  });

  it("never writes both a structured property and its raw header", () => {
    const result = convert({
      messageId: "typed@example.com",
      date: new Date("2026-09-01T10:00:00Z"),
      inReplyTo: ["typed@example.com"],
      references: [],
      headers: new Headers({
        "Message-ID": "<custom@example.com>",
        "Date": "Thu, 01 Jan 1970 00:00:00 +0000",
        "In-Reply-To": "<custom@example.com>",
        "References": "<custom@example.com>",
      }),
    });

    assert.equal(result["header:message-id"], undefined);
    assert.equal(result["header:date"], undefined);
    assert.equal(result["header:in-reply-to"], undefined);
    assert.equal(result["header:references"], undefined);
    assert.equal(result.references, undefined);
  });

  it("lets a raw header through when the field is unset", () => {
    const result = convert({
      headers: new Headers({
        "Message-ID": "<custom@example.com>",
        "In-Reply-To": "<custom@example.com>",
      }),
    });

    assert.equal(result["header:message-id"], "<custom@example.com>");
    assert.equal(result["header:in-reply-to"], "<custom@example.com>");
  });

  it("drops a raw header a structured property already carries", () => {
    const result = convert({
      headers: new Headers({
        "From": "spoofed@example.com",
        "Bcc": "hidden@example.com",
        "Subject": "Overridden",
        "Content-Type": "text/plain",
        "MIME-Version": "1.0",
        "X-Mailer": "Test Mailer",
      }),
    });

    for (
      const name of ["from", "bcc", "subject", "content-type", "mime-version"]
    ) {
      assert.equal(result[`header:${name}`], undefined);
    }
    assert.equal(result["header:x-mailer"], "Test Mailer");
  });

  it("keeps a custom priority header from shadowing the derived one", () => {
    const result = convert({
      priority: "high",
      headers: new Headers({ "X-Priority": "3" }),
    });

    assert.equal(result["header:X-Priority"], "1");
    assert.equal(result["header:x-priority"], undefined);
  });

  it("rejects an invalid identifier", () => {
    assert.throws(() => convert({ messageId: "not an identifier" }), {
      name: "TypeError",
      message: /Invalid message ID/,
    });
    assert.throws(() => convert({ references: ["a@b>"] }), {
      name: "TypeError",
      message: /Invalid message ID/,
    });
  });

  it("rejects a date it cannot express", () => {
    assert.throws(() => convert({ date: new Date("nonsense") }), {
      name: "TypeError",
      message: /Invalid date/,
    });

    const farFuture = new Date(0);
    farFuture.setUTCFullYear(10000, 0, 1);
    assert.throws(() => convert({ date: farFuture }), {
      name: "RangeError",
      message: /Year out of range/,
    });
  });

  it("rejects a header value that would forge further fields", () => {
    const headers: Message["headers"] = {
      ...new Headers(),
      entries: () =>
        [["X-Evil", "value\r\nX-Injected: yes"]]
          [Symbol.iterator]() as ReturnType<
            Headers["entries"]
          >,
    };

    assert.throws(() => convert({ headers }), {
      name: "TypeError",
      message: /carriage return or line feed/,
    });
  });
});

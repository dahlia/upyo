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

    assert.ok(result.headers);
    const priorityHeader = result.headers.find((h) => h.name === "X-Priority");
    assert.ok(priorityHeader);
    assert.equal(priorityHeader.value, "1");
  });

  it("should add priority headers for low priority", () => {
    const message: Message = {
      ...baseMessage,
      priority: "low" as Priority,
    };

    const result = convertMessage(message, "drafts-123", new Map());

    assert.ok(result.headers);
    const priorityHeader = result.headers.find((h) => h.name === "X-Priority");
    assert.ok(priorityHeader);
    assert.equal(priorityHeader.value, "5");
  });

  it("should not add priority headers for normal priority", () => {
    const result = convertMessage(baseMessage, "drafts-123", new Map());

    const priorityHeader = result.headers?.find((h) => h.name === "X-Priority");
    assert.equal(priorityHeader, undefined);
  });

  it("should include custom headers", () => {
    const headers = new Headers();
    headers.set("X-Custom-Header", "custom-value");

    const message: Message = {
      ...baseMessage,
      headers,
    };

    const result = convertMessage(message, "drafts-123", new Map());

    assert.ok(result.headers);
    // Headers.entries() returns lowercase names per HTTP spec
    const customHeader = result.headers.find(
      (h) => h.name === "x-custom-header",
    );
    assert.ok(customHeader);
    assert.equal(customHeader.value, "custom-value");
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

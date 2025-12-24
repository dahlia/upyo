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
});

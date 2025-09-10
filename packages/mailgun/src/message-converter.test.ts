import type { Message } from "@upyo/core";
import { MailgunTransport } from "@upyo/mailgun";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { convertMessage } from "./message-converter.ts";

describe("convertMessage", () => {
  const transport = new MailgunTransport({
    apiKey: "test-key",
    domain: "test-domain.com",
  });
  const config = (transport as MailgunTransport).config;

  it("should convert a simple message", async () => {
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

    const formData = await convertMessage(message, config);

    assert.equal(formData.get("from"), "sender@example.com");
    assert.equal(formData.get("to"), "recipient@example.com");
    assert.equal(formData.get("subject"), "Test Subject");
    assert.equal(formData.get("text"), "Test content");
  });

  it("should format addresses with names", async () => {
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

    const formData = await convertMessage(message, config);

    assert.equal(formData.get("from"), '"John Doe" <sender@example.com>');
    assert.equal(formData.get("to"), '"Jane Smith" <recipient@example.com>');
  });

  it("should handle HTML content", async () => {
    const message: Message = {
      sender: { address: "sender@example.com" },
      recipients: [{ address: "recipient@example.com" }],
      ccRecipients: [],
      bccRecipients: [],
      replyRecipients: [],
      subject: "Test Subject",
      content: { html: "<p>Test HTML</p>", text: "Test text" },
      attachments: [],
      priority: "normal",
      tags: [],
      headers: new Headers(),
    };

    const formData = await convertMessage(message, config);

    assert.equal(formData.get("html"), "<p>Test HTML</p>");
    assert.equal(formData.get("text"), "Test text");
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

    const formData = await convertMessage(message, config);

    assert.equal(formData.get("cc"), "cc@example.com");
    assert.equal(formData.get("bcc"), "bcc@example.com");
  });

  it("should handle reply-to addresses", async () => {
    const message: Message = {
      sender: { address: "sender@example.com" },
      recipients: [{ address: "recipient@example.com" }],
      ccRecipients: [],
      bccRecipients: [],
      replyRecipients: [{ address: "replyto@example.com" }],
      subject: "Test Subject",
      content: { text: "Test content" },
      attachments: [],
      priority: "normal",
      tags: [],
      headers: new Headers(),
    };

    const formData = await convertMessage(message, config);

    assert.equal(formData.get("h:Reply-To"), "replyto@example.com");
  });

  it("should handle priority", async () => {
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

    const formData = await convertMessage(message, config);

    assert.equal(formData.get("h:X-Priority"), "1");
  });

  it("should handle tags", async () => {
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
      tags: ["tag1", "tag2"],
      headers: new Headers(),
    };

    const formData = await convertMessage(message, config);

    const tags = formData.getAll("o:tag");
    assert.deepEqual(tags, ["tag1", "tag2"]);
  });

  it("should handle custom headers", async () => {
    const headers = new Headers();
    headers.set("X-Custom-Header", "custom-value");

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

    const formData = await convertMessage(message, config);

    // Headers are normalized to lowercase by the Headers API
    assert.equal(formData.get("h:x-custom-header"), "custom-value");
  });

  it("should handle tracking options", async () => {
    const transportWithTracking = new MailgunTransport({
      apiKey: "test-key",
      domain: "test-domain.com",
      tracking: false,
      clickTracking: false,
      openTracking: false,
    });
    const configWithTracking =
      (transportWithTracking as MailgunTransport).config;

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

    const formData = await convertMessage(message, configWithTracking);

    assert.equal(formData.get("o:tracking"), "no");
    assert.equal(formData.get("o:tracking-clicks"), "no");
    assert.equal(formData.get("o:tracking-opens"), "no");
  });

  it("should handle attachments", async () => {
    const textContent = "Hello, this is test content!";
    const textBytes = new TextEncoder().encode(textContent);

    const message: Message = {
      sender: { address: "sender@example.com" },
      recipients: [{ address: "recipient@example.com" }],
      ccRecipients: [],
      bccRecipients: [],
      replyRecipients: [],
      subject: "Test Subject with Attachment",
      content: { text: "This message has an attachment" },
      attachments: [
        {
          filename: "test.txt",
          contentType: "text/plain",
          content: textBytes,
          contentId: "",
          inline: false,
        },
        {
          filename: "data.json",
          contentType: "application/json",
          content: new TextEncoder().encode(JSON.stringify({ key: "value" })),
          contentId: "json-attachment",
          inline: true,
        },
      ],
      priority: "normal",
      tags: [],
      headers: new Headers(),
    };

    const formData = await convertMessage(message, config);

    // Check basic message fields
    assert.equal(formData.get("subject"), "Test Subject with Attachment");
    assert.equal(formData.get("text"), "This message has an attachment");

    // Check attachments were properly added to FormData
    // The actual Blob content testing is limited in unit tests,
    // but we can verify the FormData structure
    const attachmentEntries = Array.from(formData.entries()).filter(
      ([key]) => key === "attachment" || key === "inline",
    );

    // We should have 2 attachments (1 regular, 1 inline)
    assert.equal(attachmentEntries.length, 2);

    // Check that we have both attachment types
    const hasAttachment = attachmentEntries.some(([key]) =>
      key === "attachment"
    );
    const hasInline = attachmentEntries.some(([key]) => key === "inline");
    assert.ok(hasAttachment, "Should have regular attachment");
    assert.ok(hasInline, "Should have inline attachment");
  });
});

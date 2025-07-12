import type { Message } from "@upyo/core";
import { SendGridTransport } from "@upyo/sendgrid";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { convertMessage } from "./message-converter.ts";

describe("convertMessage", () => {
  const transport = new SendGridTransport({
    apiKey: "SG.test-key",
  });
  const config = (transport as any).config;

  it("should convert a basic text message", async () => {
    const message: Message = {
      sender: { address: "from@example.com", name: "Sender Name" },
      recipients: [{ address: "to@example.com", name: "Recipient Name" }],
      ccRecipients: [],
      bccRecipients: [],
      replyRecipients: [],
      subject: "Test Subject",
      content: { text: "Hello, World!" },
      attachments: [],
      priority: "normal",
      tags: [],
      headers: new Headers(),
    };

    const result = await convertMessage(message, config);

    assert.equal(result.from.email, "from@example.com");
    assert.equal(result.from.name, "Sender Name");
    assert.equal(result.personalizations[0].to[0].email, "to@example.com");
    assert.equal(result.personalizations[0].to[0].name, "Recipient Name");
    assert.equal(result.personalizations[0].subject, "Test Subject");
    assert.equal(result.content![0].type, "text/plain");
    assert.equal(result.content![0].value, "Hello, World!");
  });

  it("should convert a message with HTML content", async () => {
    const message: Message = {
      sender: { address: "from@example.com" },
      recipients: [{ address: "to@example.com" }],
      ccRecipients: [],
      bccRecipients: [],
      replyRecipients: [],
      subject: "Test Subject",
      content: {
        text: "Hello, World!",
        html: "<h1>Hello, World!</h1>",
      },
      attachments: [],
      priority: "normal",
      tags: [],
      headers: new Headers(),
    };

    const result = await convertMessage(message, config);

    assert.equal(result.content!.length, 2);
    assert.equal(result.content![0].type, "text/plain");
    assert.equal(result.content![0].value, "Hello, World!");
    assert.equal(result.content![1].type, "text/html");
    assert.equal(result.content![1].value, "<h1>Hello, World!</h1>");
  });

  it("should handle CC and BCC recipients", async () => {
    const message: Message = {
      sender: { address: "from@example.com" },
      recipients: [{ address: "to@example.com" }],
      ccRecipients: [{ address: "cc@example.com" }],
      bccRecipients: [{ address: "bcc@example.com" }],
      replyRecipients: [],
      subject: "Test Subject",
      content: { text: "Hello, World!" },
      attachments: [],
      priority: "normal",
      tags: [],
      headers: new Headers(),
    };

    const result = await convertMessage(message, config);

    assert.equal(result.personalizations[0].cc![0].email, "cc@example.com");
    assert.equal(result.personalizations[0].bcc![0].email, "bcc@example.com");
  });

  it("should handle reply-to recipients", async () => {
    const message: Message = {
      sender: { address: "from@example.com" },
      recipients: [{ address: "to@example.com" }],
      ccRecipients: [],
      bccRecipients: [],
      replyRecipients: [{ address: "reply@example.com" }],
      subject: "Test Subject",
      content: { text: "Hello, World!" },
      attachments: [],
      priority: "normal",
      tags: [],
      headers: new Headers(),
    };

    const result = await convertMessage(message, config);

    assert.equal(result.reply_to!.email, "reply@example.com");
  });

  it("should handle multiple reply-to recipients", async () => {
    const message: Message = {
      sender: { address: "from@example.com" },
      recipients: [{ address: "to@example.com" }],
      ccRecipients: [],
      bccRecipients: [],
      replyRecipients: [
        { address: "reply1@example.com" },
        { address: "reply2@example.com" },
      ],
      subject: "Test Subject",
      content: { text: "Hello, World!" },
      attachments: [],
      priority: "normal",
      tags: [],
      headers: new Headers(),
    };

    const result = await convertMessage(message, config);

    assert.equal(result.reply_to_list!.length, 2);
    assert.equal(result.reply_to_list![0].email, "reply1@example.com");
    assert.equal(result.reply_to_list![1].email, "reply2@example.com");
  });

  it("should handle priority settings", async () => {
    const message: Message = {
      sender: { address: "from@example.com" },
      recipients: [{ address: "to@example.com" }],
      ccRecipients: [],
      bccRecipients: [],
      replyRecipients: [],
      subject: "Test Subject",
      content: { text: "Hello, World!" },
      attachments: [],
      priority: "high",
      tags: [],
      headers: new Headers(),
    };

    const result = await convertMessage(message, config);

    assert.equal(result.headers!["X-Priority"], "1");
    assert.equal(result.headers!["X-MSMail-Priority"], "High");
    assert.equal(result.headers!["Importance"], "High");
  });

  it("should handle tags as categories", async () => {
    const message: Message = {
      sender: { address: "from@example.com" },
      recipients: [{ address: "to@example.com" }],
      ccRecipients: [],
      bccRecipients: [],
      replyRecipients: [],
      subject: "Test Subject",
      content: { text: "Hello, World!" },
      attachments: [],
      priority: "normal",
      tags: ["newsletter", "marketing"],
      headers: new Headers(),
    };

    const result = await convertMessage(message, config);

    assert.deepEqual(result.categories, ["newsletter", "marketing"]);
  });

  it("should handle custom headers", async () => {
    const headers = new Headers();
    headers.set("X-Custom-Header", "custom-value");
    headers.set("X-Campaign-ID", "campaign-123");

    const message: Message = {
      sender: { address: "from@example.com" },
      recipients: [{ address: "to@example.com" }],
      ccRecipients: [],
      bccRecipients: [],
      replyRecipients: [],
      subject: "Test Subject",
      content: { text: "Hello, World!" },
      attachments: [],
      priority: "normal",
      tags: [],
      headers,
    };

    const result = await convertMessage(message, config);

    assert.equal(result.headers!["x-custom-header"], "custom-value");
    assert.equal(result.headers!["x-campaign-id"], "campaign-123");
  });

  it("should handle tracking settings", async () => {
    const transportWithTracking = new SendGridTransport({
      apiKey: "SG.test-key",
      clickTracking: false,
      openTracking: true,
      subscriptionTracking: true,
      googleAnalytics: true,
    });
    const configWithTracking = (transportWithTracking as any).config;

    const message: Message = {
      sender: { address: "from@example.com" },
      recipients: [{ address: "to@example.com" }],
      ccRecipients: [],
      bccRecipients: [],
      replyRecipients: [],
      subject: "Test Subject",
      content: { text: "Hello, World!" },
      attachments: [],
      priority: "normal",
      tags: [],
      headers: new Headers(),
    };

    const result = await convertMessage(message, configWithTracking);

    assert.equal(result.tracking_settings!.click_tracking!.enable, false);
    assert.equal(result.tracking_settings!.open_tracking!.enable, true);
    assert.equal(result.tracking_settings!.subscription_tracking!.enable, true);
    assert.equal(result.tracking_settings!.ganalytics!.enable, true);
  });

  it("should handle attachments", async () => {
    const textContent = new TextEncoder().encode("Hello, attachment!");

    const message: Message = {
      sender: { address: "from@example.com" },
      recipients: [{ address: "to@example.com" }],
      ccRecipients: [],
      bccRecipients: [],
      replyRecipients: [],
      subject: "Test Subject",
      content: { text: "Hello, World!" },
      attachments: [
        {
          filename: "test.txt",
          contentType: "text/plain",
          content: Promise.resolve(textContent),
          inline: false,
          contentId: "",
        },
      ],
      priority: "normal",
      tags: [],
      headers: new Headers(),
    };

    const result = await convertMessage(message, config);

    assert.equal(result.attachments!.length, 1);
    assert.equal(result.attachments![0].filename, "test.txt");
    assert.equal(result.attachments![0].type, "text/plain");
    assert.equal(result.attachments![0].disposition, "attachment");
    // Base64 encoded "Hello, attachment!"
    assert.equal(result.attachments![0].content, btoa("Hello, attachment!"));
  });

  it("should handle inline attachments", async () => {
    const textContent = new TextEncoder().encode("Inline content");

    const message: Message = {
      sender: { address: "from@example.com" },
      recipients: [{ address: "to@example.com" }],
      ccRecipients: [],
      bccRecipients: [],
      replyRecipients: [],
      subject: "Test Subject",
      content: { text: "Hello, World!" },
      attachments: [
        {
          filename: "inline.txt",
          contentType: "text/plain",
          content: Promise.resolve(textContent),
          inline: true,
          contentId: "inline-123",
        },
      ],
      priority: "normal",
      tags: [],
      headers: new Headers(),
    };

    const result = await convertMessage(message, config);

    assert.equal(result.attachments!.length, 1);
    assert.equal(result.attachments![0].disposition, "inline");
    assert.equal(result.attachments![0].content_id, "inline-123");
  });
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { createMessage } from "@upyo/core";
import { convertMessage } from "./message-converter.ts";
import { createSesConfig } from "./config.ts";

test("convertMessage handles simple text message", async () => {
  const config = createSesConfig({
    authentication: {
      type: "credentials",
      accessKeyId: "test-key",
      secretAccessKey: "test-secret",
    },
  });

  const message = createMessage({
    from: "sender@example.com",
    to: "recipient@example.com",
    subject: "Test Subject",
    content: { text: "Hello World!" },
  });

  const sesMessage = await convertMessage(message, config);

  assert.equal(sesMessage.FromEmailAddress, "sender@example.com");
  assert.deepEqual(sesMessage.Destination.ToAddresses, [
    "recipient@example.com",
  ]);
  assert.equal(sesMessage.Content.Simple?.Subject.Data, "Test Subject");
  assert.equal(sesMessage.Content.Simple?.Body.Text?.Data, "Hello World!");
  assert.equal(sesMessage.Content.Simple?.Body.Html, undefined);
});

test("convertMessage handles HTML message with text fallback", async () => {
  const config = createSesConfig({
    authentication: {
      type: "credentials",
      accessKeyId: "test-key",
      secretAccessKey: "test-secret",
    },
  });

  const message = createMessage({
    from: "sender@example.com",
    to: "recipient@example.com",
    subject: "HTML Test",
    content: {
      html: "<h1>Hello World!</h1>",
      text: "Hello World!",
    },
  });

  const sesMessage = await convertMessage(message, config);

  assert.equal(
    sesMessage.Content.Simple?.Body.Html?.Data,
    "<h1>Hello World!</h1>",
  );
  assert.equal(sesMessage.Content.Simple?.Body.Text?.Data, "Hello World!");
});

test("convertMessage handles multiple recipients", async () => {
  const config = createSesConfig({
    authentication: {
      type: "credentials",
      accessKeyId: "test-key",
      secretAccessKey: "test-secret",
    },
  });

  const message = createMessage({
    from: "sender@example.com",
    to: ["recipient1@example.com", "recipient2@example.com"],
    cc: "cc@example.com",
    bcc: ["bcc1@example.com", "bcc2@example.com"],
    subject: "Multiple Recipients",
    content: { text: "Hello Everyone!" },
  });

  const sesMessage = await convertMessage(message, config);

  assert.deepEqual(sesMessage.Destination.ToAddresses, [
    "recipient1@example.com",
    "recipient2@example.com",
  ]);
  assert.deepEqual(sesMessage.Destination.CcAddresses, ["cc@example.com"]);
  assert.deepEqual(sesMessage.Destination.BccAddresses, [
    "bcc1@example.com",
    "bcc2@example.com",
  ]);
});

test("convertMessage handles reply-to addresses", async () => {
  const config = createSesConfig({
    authentication: {
      type: "credentials",
      accessKeyId: "test-key",
      secretAccessKey: "test-secret",
    },
  });

  const message = createMessage({
    from: "sender@example.com",
    to: "recipient@example.com",
    replyTo: ["reply1@example.com", "reply2@example.com"],
    subject: "Reply-To Test",
    content: { text: "Hello!" },
  });

  const sesMessage = await convertMessage(message, config);

  assert.deepEqual(sesMessage.ReplyToAddresses, [
    "reply1@example.com",
    "reply2@example.com",
  ]);
});

test("convertMessage handles tags and priority", async () => {
  const config = createSesConfig({
    authentication: {
      type: "credentials",
      accessKeyId: "test-key",
      secretAccessKey: "test-secret",
    },
    defaultTags: { environment: "test" },
  });

  const message = createMessage({
    from: "sender@example.com",
    to: "recipient@example.com",
    subject: "Tagged Message",
    content: { text: "Hello!" },
    tags: ["newsletter", "marketing"],
    priority: "high",
  });

  const sesMessage = await convertMessage(message, config);

  const tags = sesMessage.Tags || [];

  assert.ok(
    tags.some((tag) => tag.Name === "category" && tag.Value === "newsletter"),
  );
  assert.ok(
    tags.some((tag) => tag.Name === "category" && tag.Value === "marketing"),
  );
  assert.ok(
    tags.some((tag) => tag.Name === "priority" && tag.Value === "high"),
  );
  assert.ok(
    tags.some((tag) => tag.Name === "environment" && tag.Value === "test"),
  );
});

test("convertMessage handles configuration set", async () => {
  const config = createSesConfig({
    authentication: {
      type: "credentials",
      accessKeyId: "test-key",
      secretAccessKey: "test-secret",
    },
    configurationSetName: "test-config-set",
  });

  const message = createMessage({
    from: "sender@example.com",
    to: "recipient@example.com",
    subject: "Config Set Test",
    content: { text: "Hello!" },
  });

  const sesMessage = await convertMessage(message, config);

  assert.equal(sesMessage.ConfigurationSetName, "test-config-set");
});

test("convertMessage handles named addresses", async () => {
  const config = createSesConfig({
    authentication: {
      type: "credentials",
      accessKeyId: "test-key",
      secretAccessKey: "test-secret",
    },
  });

  const message = createMessage({
    from: { address: "sender@example.com", name: "John Sender" },
    to: { address: "recipient@example.com", name: "Jane Recipient" },
    subject: "Named Addresses",
    content: { text: "Hello!" },
  });

  const sesMessage = await convertMessage(message, config);

  assert.equal(
    sesMessage.FromEmailAddress,
    '"John Sender" <sender@example.com>',
  );
  assert.deepEqual(sesMessage.Destination.ToAddresses, [
    '"Jane Recipient" <recipient@example.com>',
  ]);
});

test("convertMessage handles attachments", async () => {
  const config = createSesConfig({
    authentication: {
      type: "credentials",
      accessKeyId: "test-key",
      secretAccessKey: "test-secret",
    },
  });

  const attachment = {
    inline: false,
    filename: "test.txt",
    content: Promise.resolve(new Uint8Array([72, 101, 108, 108, 111])), // "Hello"
    contentType: "text/plain" as const,
    contentId: "test-content-id",
  };

  const message = createMessage({
    from: "sender@example.com",
    to: "recipient@example.com",
    subject: "Test with Attachment",
    content: { text: "Message with attachment" },
    attachments: [attachment],
  });

  const sesMessage = await convertMessage(message, config);

  assert.ok(sesMessage.Content.Simple?.Attachments);
  assert.equal(sesMessage.Content.Simple.Attachments.length, 1);

  const sesAttachment = sesMessage.Content.Simple.Attachments[0];
  assert.equal(sesAttachment.FileName, "test.txt");
  assert.equal(sesAttachment.ContentType, "text/plain");
  assert.equal(sesAttachment.ContentDisposition, "ATTACHMENT");
  assert.equal(sesAttachment.ContentId, "test-content-id");
  assert.equal(sesAttachment.ContentTransferEncoding, "BASE64");
  assert.equal(sesAttachment.RawContent, btoa("Hello"));
});

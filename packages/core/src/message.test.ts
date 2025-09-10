import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createMessage, type MessageConstructor } from "./message.ts";

describe("createMessage", () => {
  it("should create a message with required fields only", () => {
    const constructor: MessageConstructor = {
      from: "sender@example.com",
      to: "recipient@example.com",
      subject: "Test Subject",
      content: { text: "Test content" },
    };

    const message = createMessage(constructor);

    assert.deepEqual(message.sender, {
      address: "sender@example.com",
    });
    assert.deepEqual(message.recipients, [{
      address: "recipient@example.com",
    }]);
    assert.equal(message.subject, "Test Subject");
    assert.deepEqual(message.content, { text: "Test content" });
    assert.equal(message.priority, "normal");
    assert.deepEqual(message.ccRecipients, []);
    assert.deepEqual(message.bccRecipients, []);
    assert.deepEqual(message.replyRecipients, []);
    assert.deepEqual(message.attachments, []);
    assert.deepEqual(message.tags, []);
    assert.ok(message.headers instanceof Headers);
  });

  it("should parse email addresses from strings", () => {
    const constructor: MessageConstructor = {
      from: "John Doe <john@example.com>",
      to: "Jane Smith <jane@example.com>",
      subject: "Test",
      content: { text: "Test" },
    };

    const message = createMessage(constructor);

    assert.deepEqual(message.sender, {
      name: "John Doe",
      address: "john@example.com",
    });
    assert.deepEqual(message.recipients, [{
      name: "Jane Smith",
      address: "jane@example.com",
    }]);
  });

  it("should handle multiple recipients as array", () => {
    const constructor: MessageConstructor = {
      from: "sender@example.com",
      to: ["recipient1@example.com", "recipient2@example.com"],
      cc: ["cc1@example.com", "cc2@example.com"],
      bcc: "bcc@example.com",
      replyTo: ["reply1@example.com", "reply2@example.com"],
      subject: "Test",
      content: { text: "Test" },
    };

    const message = createMessage(constructor);

    assert.equal(message.recipients.length, 2);
    assert.deepEqual(message.recipients[0], {
      address: "recipient1@example.com",
    });
    assert.deepEqual(message.recipients[1], {
      address: "recipient2@example.com",
    });

    assert.equal(message.ccRecipients.length, 2);
    assert.deepEqual(message.ccRecipients[0], {
      address: "cc1@example.com",
    });
    assert.deepEqual(message.ccRecipients[1], {
      address: "cc2@example.com",
    });

    assert.equal(message.bccRecipients.length, 1);
    assert.deepEqual(message.bccRecipients[0], {
      address: "bcc@example.com",
    });

    assert.equal(message.replyRecipients.length, 2);
    assert.deepEqual(message.replyRecipients[0], {
      address: "reply1@example.com",
    });
    assert.deepEqual(message.replyRecipients[1], {
      address: "reply2@example.com",
    });
  });

  it("should convert File objects to attachments", async () => {
    const fileContent = new Uint8Array([1, 2, 3, 4]);
    const file = new File([fileContent], "test.txt", { type: "text/plain" });

    const constructor: MessageConstructor = {
      from: "sender@example.com",
      to: "recipient@example.com",
      subject: "Test",
      content: { text: "Test" },
      attachments: file,
    };

    const message = createMessage(constructor);

    assert.equal(message.attachments.length, 1);
    const attachment = message.attachments[0];
    assert.equal(attachment.filename, "test.txt");
    assert.equal(attachment.contentType.split(";")[0].trim(), "text/plain");
    assert.equal(attachment.inline, false);
    assert.ok(
      attachment.contentId.match(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}@example.com$/,
      ),
    );

    const content = await attachment.content;
    assert.ok(content instanceof Uint8Array);
    assert.deepEqual(content, fileContent);
  });

  it("should handle File with no type", () => {
    const file = new File([new Uint8Array([1, 2, 3])], "test.bin");

    const constructor: MessageConstructor = {
      from: "sender@example.com",
      to: "recipient@example.com",
      subject: "Test",
      content: { text: "Test" },
      attachments: file,
    };

    const message = createMessage(constructor);

    assert.equal(
      message.attachments[0].contentType,
      "application/octet-stream",
    );
  });

  it("should handle multiple attachments", () => {
    const file1 = new File([new Uint8Array([1])], "file1.txt", {
      type: "text/plain",
    });
    const file2 = new File([new Uint8Array([2])], "file2.txt", {
      type: "text/plain",
    });

    const constructor: MessageConstructor = {
      from: "sender@example.com",
      to: "recipient@example.com",
      subject: "Test",
      content: { text: "Test" },
      attachments: [file1, file2],
    };

    const message = createMessage(constructor);

    assert.equal(message.attachments.length, 2);
    assert.equal(message.attachments[0].filename, "file1.txt");
    assert.equal(message.attachments[1].filename, "file2.txt");
  });

  it("should set default values for optional properties", () => {
    const constructor: MessageConstructor = {
      from: "sender@example.com",
      to: "recipient@example.com",
      subject: "Test",
      content: { text: "Test" },
    };

    const message = createMessage(constructor);

    assert.equal(message.priority, "normal");
    assert.deepEqual(message.ccRecipients, []);
    assert.deepEqual(message.bccRecipients, []);
    assert.deepEqual(message.replyRecipients, []);
    assert.deepEqual(message.attachments, []);
    assert.deepEqual(message.tags, []);
  });

  it("should use provided optional values", () => {
    const constructor: MessageConstructor = {
      from: "sender@example.com",
      to: "recipient@example.com",
      subject: "Test",
      content: { text: "Test" },
      priority: "high",
      tags: ["important", "urgent"],
      headers: { "X-Custom": "value" },
    };

    const message = createMessage(constructor);

    assert.equal(message.priority, "high");
    assert.deepEqual(message.tags, ["important", "urgent"]);
    assert.equal(message.headers.get("X-Custom"), "value");
  });

  it("should handle HTML content", () => {
    const constructor: MessageConstructor = {
      from: "sender@example.com",
      to: "recipient@example.com",
      subject: "Test",
      content: { html: "<h1>Hello</h1>", text: "Hello" },
    };

    const message = createMessage(constructor);

    assert.deepEqual(message.content, {
      html: "<h1>Hello</h1>",
      text: "Hello",
    });
  });

  it("should throw TypeError for invalid sender address", () => {
    const constructor: MessageConstructor = {
      from: "invalid-email",
      to: "recipient@example.com",
      subject: "Test",
      content: { text: "Test" },
    };

    assert.throws(
      () => createMessage(constructor),
      { name: "TypeError", message: /Invalid sender address/ },
    );
  });

  it("should throw TypeError for invalid recipient address", () => {
    const constructor: MessageConstructor = {
      from: "sender@example.com",
      to: "invalid-email",
      subject: "Test",
      content: { text: "Test" },
    };

    assert.throws(
      () => createMessage(constructor),
      { name: "TypeError", message: /Invalid recipient address/ },
    );
  });

  it("should throw TypeError for invalid CC address", () => {
    const constructor: MessageConstructor = {
      from: "sender@example.com",
      to: "recipient@example.com",
      cc: "invalid-email",
      subject: "Test",
      content: { text: "Test" },
    };

    assert.throws(
      () => createMessage(constructor),
      { name: "TypeError", message: /Invalid CC address/ },
    );
  });

  it("should throw TypeError for invalid BCC address", () => {
    const constructor: MessageConstructor = {
      from: "sender@example.com",
      to: "recipient@example.com",
      bcc: "invalid-email",
      subject: "Test",
      content: { text: "Test" },
    };

    assert.throws(
      () => createMessage(constructor),
      { name: "TypeError", message: /Invalid BCC address/ },
    );
  });

  it("should throw TypeError for invalid reply-to address", () => {
    const constructor: MessageConstructor = {
      from: "sender@example.com",
      to: "recipient@example.com",
      replyTo: "invalid-email",
      subject: "Test",
      content: { text: "Test" },
    };

    assert.throws(
      () => createMessage(constructor),
      { name: "TypeError", message: /Invalid reply-to address/ },
    );
  });
});

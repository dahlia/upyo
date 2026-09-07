import { describe, it } from "node:test";
import { readAttachmentContent } from "./attachment.ts";
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

  it("should parse internationalized email addresses", () => {
    const message = createMessage({
      from: "José <josé@example.com>",
      to: "用户@例子.广告",
      subject: "Test",
      content: { text: "Test" },
    });

    assert.deepEqual(message.sender, {
      name: "José",
      address: "josé@example.com",
    });
    assert.deepEqual(message.recipients, [{
      address: "用户@例子.广告",
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

    assert.equal(attachment.content, file);
    const content = await readAttachmentContent(attachment.content);
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

  const lineBreaks = [
    { label: "CR", value: "\r" },
    { label: "LF", value: "\n" },
    { label: "CRLF", value: "\r\n" },
  ] as const;

  const addressFields = [
    { key: "from", pattern: /Invalid sender address/ },
    { key: "to", pattern: /Invalid recipient address/ },
    { key: "cc", pattern: /Invalid CC address/ },
    { key: "bcc", pattern: /Invalid BCC address/ },
    { key: "replyTo", pattern: /Invalid reply-to address/ },
  ] as const;

  for (const { label, value } of lineBreaks) {
    for (const { key, pattern } of addressFields) {
      it(`should reject ${label} in a ${key} address object`, () => {
        const constructor: MessageConstructor = {
          from: "sender@example.com",
          to: "recipient@example.com",
          subject: "Test Subject",
          content: { text: "Test content" },
          [key]: {
            address: `victim@example.net${value}Bcc: attacker@evil.example`,
          },
        };

        assert.throws(
          () => createMessage(constructor),
          { name: "TypeError", message: pattern },
        );
      });
    }

    it(`should reject ${label} in an address string`, () => {
      const constructor: MessageConstructor = {
        from: "sender@example.com",
        to: `victim@example.net${value}Bcc: attacker@evil.example`,
        subject: "Test Subject",
        content: { text: "Test content" },
      };

      assert.throws(
        () => createMessage(constructor),
        { name: "TypeError", message: /Invalid recipient address/ },
      );
    });

    it(`should reject ${label} in an attachment content type`, () => {
      const constructor: MessageConstructor = {
        from: "sender@example.com",
        to: "recipient@example.com",
        subject: "Test Subject",
        content: { text: "Test content" },
        attachments: [{
          inline: false,
          filename: "report.pdf",
          content: new Uint8Array([1, 2, 3]),
          contentType: `application/pdf${value}X-Injected: header`,
          contentId: "cid@example.com",
        }],
      };

      assert.throws(
        () => createMessage(constructor),
        { name: "TypeError", message: /Invalid attachment content type/ },
      );
    });

    it(`should reject ${label} in an attachment content ID`, () => {
      const constructor: MessageConstructor = {
        from: "sender@example.com",
        to: "recipient@example.com",
        subject: "Test Subject",
        content: { text: "Test content" },
        attachments: [{
          inline: true,
          filename: "logo.png",
          content: new Uint8Array([1, 2, 3]),
          contentType: "image/png",
          contentId: `cid@example.com>${value}X-Injected: header`,
        }],
      };

      assert.throws(
        () => createMessage(constructor),
        { name: "TypeError", message: /Invalid attachment content ID/ },
      );
    });
  }

  it("should accept addresses and attachments without CR or LF", () => {
    const message = createMessage({
      from: { name: "Sender", address: "sender@example.com" },
      to: { address: "recipient@example.com" },
      subject: "Test Subject",
      content: { text: "Test content" },
      attachments: [{
        inline: false,
        filename: "report.pdf",
        content: new Uint8Array([1, 2, 3]),
        contentType: "application/pdf",
        contentId: "cid@example.com",
      }],
    });

    assert.deepEqual(message.sender, {
      name: "Sender",
      address: "sender@example.com",
    });
    assert.equal(message.attachments.length, 1);
    assert.equal(message.attachments[0].contentType, "application/pdf");
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

describe("createMessage() identity and threading", () => {
  const base: MessageConstructor = {
    from: "sender@example.com",
    to: "recipient@example.com",
    subject: "Test",
    content: { text: "Test" },
  };

  it("should leave the fields unset when they are not given", () => {
    const message = createMessage(base);

    assert.equal(message.messageId, undefined);
    assert.equal(message.date, undefined);
    assert.equal(message.inReplyTo, undefined);
    assert.equal(message.references, undefined);
  });

  it("should strip the angle brackets from an identifier", () => {
    const message = createMessage({
      ...base,
      messageId: "<123@example.com>",
      inReplyTo: "<122@example.com>",
      references: ["<120@example.com>", "121@example.com"],
    });

    assert.equal(message.messageId, "123@example.com");
    assert.deepEqual(message.inReplyTo, ["122@example.com"]);
    assert.deepEqual(message.references, [
      "120@example.com",
      "121@example.com",
    ]);
  });

  it("should keep an empty list distinct from an absent one", () => {
    const message = createMessage({ ...base, inReplyTo: [], references: [] });

    assert.deepEqual(message.inReplyTo, []);
    assert.deepEqual(message.references, []);
  });

  it("should treat a single string as one identifier", () => {
    const message = createMessage({ ...base, references: "120@example.com" });

    assert.deepEqual(message.references, ["120@example.com"]);
  });

  it("should copy the date and the identifier lists", () => {
    const date = new Date("2026-09-01T10:00:00Z");
    const references = ["120@example.com"];
    const message = createMessage({ ...base, date, references });

    date.setUTCFullYear(1999);
    references.push("121@example.com");

    assert.equal(message.date?.toISOString(), "2026-09-01T10:00:00.000Z");
    assert.deepEqual(message.references, ["120@example.com"]);
  });

  const invalidIds = [
    "",
    "no-at-sign",
    "a@b c@d",
    "a..b@example.com",
    "a@example.com>",
    "a@example.com\r\nX-Injected: yes",
  ];

  for (const invalid of invalidIds) {
    it(`should reject ${JSON.stringify(invalid)} as a message ID`, () => {
      assert.throws(
        () => createMessage({ ...base, messageId: invalid }),
        { name: "TypeError", message: /Invalid message ID/ },
      );
    });

    it(`should reject ${JSON.stringify(invalid)} in a reply reference`, () => {
      assert.throws(
        () => createMessage({ ...base, inReplyTo: invalid }),
        { name: "TypeError", message: /Invalid in-reply-to message ID/ },
      );
      assert.throws(
        () => createMessage({ ...base, references: [invalid] }),
        { name: "TypeError", message: /Invalid references message ID/ },
      );
    });
  }

  it("should reject an invalid date", () => {
    assert.throws(
      () => createMessage({ ...base, date: new Date("nonsense") }),
      { name: "TypeError", message: /Invalid date/ },
    );
  });

  it("should reject a date RFC 5322 cannot express", () => {
    assert.throws(
      () => createMessage({ ...base, date: new Date("1899-12-31T23:59:59Z") }),
      { name: "TypeError", message: /Invalid date/ },
    );
    assert.doesNotThrow(() =>
      createMessage({ ...base, date: new Date("1900-01-01T00:00:00Z") })
    );
  });
});

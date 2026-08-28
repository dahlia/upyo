import type { Address, Message } from "@upyo/core";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { describe, test } from "node:test";
import { convertMessage } from "./message-converter.ts";

describe("Message Converter Integration Tests", () => {
  const createTestMessage = (overrides: Partial<Message> = {}): Message => ({
    sender: { name: "John Doe", address: "john@example.com" },
    recipients: [{ name: "Jane Doe", address: "jane@example.com" }],
    ccRecipients: [],
    bccRecipients: [],
    replyRecipients: [],
    subject: "Test Subject",
    content: { text: "Hello, World!" },
    attachments: [],
    priority: "normal",
    tags: [],
    headers: new Headers(),
    ...overrides,
  });

  describe("Basic Message Conversion", () => {
    test("should convert simple text message to SMTP format", async () => {
      const message = createTestMessage();
      const result = await convertMessage(message);

      // Test envelope
      assert.strictEqual(result.envelope.from, "john@example.com");
      assert.deepStrictEqual(result.envelope.to, ["jane@example.com"]);
      assert.equal(result.requiresSmtpUtf8, false);

      // Test raw message structure
      const lines = result.raw.split("\r\n");
      assert.ok(
        lines.some((line) =>
          line.startsWith("From: John Doe <john@example.com>")
        ),
      );
      assert.ok(
        lines.some((line) =>
          line.startsWith("To: Jane Doe <jane@example.com>")
        ),
      );
      assert.ok(lines.some((line) => line.startsWith("Subject: Test Subject")));
      assert.ok(lines.some((line) => line.startsWith("Date:")));
      assert.ok(lines.some((line) => line.startsWith("Message-ID:")));
      assert.ok(lines.some((line) => line === "MIME-Version: 1.0"));
      assert.ok(result.raw.includes("Hello, World!"));
    });

    test("should handle multiple recipients in envelope", async () => {
      const message = createTestMessage({
        recipients: [
          { address: "jane@example.com" },
          { address: "bob@example.com" },
        ],
        ccRecipients: [{ address: "cc@example.com" }],
        bccRecipients: [{ address: "bcc@example.com" }],
      });

      const result = await convertMessage(message);

      // Envelope should include all recipients
      assert.deepStrictEqual(result.envelope.to, [
        "jane@example.com",
        "bob@example.com",
        "cc@example.com",
        "bcc@example.com",
      ]);

      // Raw message should only show To and Cc headers (not BCC)
      assert.ok(result.raw.includes("To: jane@example.com, bob@example.com"));
      assert.ok(result.raw.includes("Cc: cc@example.com"));
      assert.ok(!result.raw.includes("Bcc:")); // BCC should not appear in headers
    });

    test("should fold long recipient headers", async () => {
      const recipients: readonly Address[] = Array.from(
        { length: 60 },
        (_, index) => ({
          address: `recipient-${index.toString().padStart(3, "0")}@example.com`,
        }),
      );
      const result = await convertMessage(createTestMessage({ recipients }));
      const headerSection = result.raw.split("\r\n\r\n", 1)[0];

      for (const line of headerSection.split("\r\n")) {
        assert.ok(
          line.length <= 998,
          `Header line is ${line.length} characters long.`,
        );
      }

      const unfoldedHeaders = headerSection.replace(/\r\n[ \t]+/g, " ");
      assert.ok(
        unfoldedHeaders.includes(
          `To: ${recipients.map((recipient) => recipient.address).join(", ")}`,
        ),
      );
    });

    test("should preserve whitespace when folding headers", async () => {
      const subject = `${"word  ".repeat(20)}word`;
      const result = await convertMessage(createTestMessage({ subject }));
      const subjectHeader = result.raw.split("\r\n\r\n", 1)[0].split("\r\n")
        .filter((line) => line.startsWith("Subject: ") || /^[ \t]/.test(line))
        .join("\r\n");

      assert.equal(subjectHeader.replace(/\r\n/g, ""), `Subject: ${subject}`);
    });

    test("should not create whitespace-only continuation lines", async () => {
      const subject = `${"word ".repeat(20)}${" ".repeat(21)}`;
      const result = await convertMessage(createTestMessage({ subject }));
      const headerSection = result.raw.split("\r\n\r\n", 1)[0];

      assert.ok(
        !headerSection.split("\r\n").some((line) => /^\s+$/.test(line)),
      );
    });
  });

  describe("Content Type Handling", () => {
    test("should create single-part HTML message", async () => {
      const message = createTestMessage({
        content: { html: "<h1>Hello</h1><p>World!</p>" },
      });

      const result = await convertMessage(message);

      assert.ok(result.raw.includes("Content-Type: text/html; charset=utf-8"));
      assert.ok(
        result.raw.includes("Content-Transfer-Encoding: quoted-printable"),
      );
      assert.ok(result.raw.includes("<h1>Hello</h1><p>World!</p>"));
      assert.ok(!result.raw.includes("multipart"));
    });

    test("should create multipart/alternative for mixed content", async () => {
      const message = createTestMessage({
        content: {
          text: "Hello World in plain text",
          html: "<h1>Hello World</h1><p>in HTML</p>",
        },
      });

      const result = await convertMessage(message);

      // Should be multipart/alternative
      assert.ok(result.raw.includes("Content-Type: multipart/alternative"));

      // Should contain both content types
      assert.ok(result.raw.includes("Content-Type: text/plain; charset=utf-8"));
      assert.ok(result.raw.includes("Content-Type: text/html; charset=utf-8"));

      // Should contain both content versions
      assert.ok(result.raw.includes("Hello World in plain text"));
      assert.ok(result.raw.includes("<h1>Hello World</h1>"));

      // Should have proper boundary structure
      const boundaryMatch = result.raw.match(/boundary="([^"]+)"/);
      assert.ok(boundaryMatch);
      const boundary = boundaryMatch[1];
      assert.ok(result.raw.includes(`--${boundary}`));
      assert.ok(result.raw.includes(`--${boundary}--`));
    });
  });

  describe("Attachment Handling", () => {
    test("should create multipart/mixed with single attachment", async () => {
      const attachmentContent = new TextEncoder().encode("File content here");
      const message = createTestMessage({
        attachments: [
          {
            filename: "test.txt",
            content: attachmentContent,
            contentType: "text/plain",
            contentId: "test-file",
            inline: false,
          },
        ],
      });

      const result = await convertMessage(message);

      // Should be multipart/mixed
      assert.ok(result.raw.includes("Content-Type: multipart/mixed"));

      // Should contain attachment headers
      assert.ok(
        result.raw.includes('Content-Type: text/plain; name="test.txt"'),
      );
      assert.ok(result.raw.includes("Content-Transfer-Encoding: base64"));
      assert.ok(
        result.raw.includes(
          'Content-Disposition: attachment; filename="test.txt"',
        ),
      );

      // Should contain base64 encoded content
      const expectedBase64 = btoa(String.fromCharCode(...attachmentContent));
      assert.ok(result.raw.includes(expectedBase64));
    });

    test("should handle inline attachments with Content-ID", async () => {
      const imageContent = new Uint8Array([0x89, 0x50, 0x4E, 0x47]); // PNG signature
      const message = createTestMessage({
        attachments: [
          {
            filename: "image.png",
            content: imageContent,
            contentType: "image/png",
            contentId: "embedded-image",
            inline: true,
          },
        ],
      });

      const result = await convertMessage(message);

      assert.ok(
        result.raw.includes('Content-Type: image/png; name="image.png"'),
      );
      assert.ok(
        result.raw.includes(
          'Content-Disposition: inline; filename="image.png"',
        ),
      );
      assert.ok(result.raw.includes("Content-ID: <embedded-image>"));
    });

    test("should handle mixed content with attachments", async () => {
      const attachmentContent = new TextEncoder().encode("Attachment data");
      const message = createTestMessage({
        content: {
          text: "Text version",
          html: "<p>HTML version</p>",
        },
        attachments: [
          {
            filename: "document.pdf",
            content: attachmentContent,
            contentType: "application/pdf",
            contentId: "doc",
            inline: false,
          },
        ],
      });

      const result = await convertMessage(message);

      // Should be multipart/mixed at top level
      assert.ok(result.raw.includes("Content-Type: multipart/mixed"));

      // Should contain nested multipart/alternative for content
      assert.ok(result.raw.includes("Content-Type: multipart/alternative"));

      // Should contain all parts
      assert.ok(result.raw.includes("Text version"));
      assert.ok(result.raw.includes("<p>HTML version</p>"));
      assert.ok(
        result.raw.includes(
          'Content-Type: application/pdf; name="document.pdf"',
        ),
      );
    });

    test("should fold MIME parameters for long filenames", async () => {
      const filename = `${"long-file-name-".repeat(90)}.txt`;
      const result = await convertMessage(createTestMessage({
        attachments: [{
          filename,
          content: new Uint8Array([1, 2, 3]),
          contentType: "application/octet-stream",
          contentId: "long-filename",
          inline: false,
        }],
      }));

      for (const line of result.raw.split("\r\n")) {
        assert.ok(
          line.length <= 998,
          `Message line is ${line.length} characters long.`,
        );
      }
      assert.ok(result.raw.includes("name*0*=UTF-8''"));
      assert.ok(result.raw.includes("filename*0*=UTF-8''"));
    });
  });

  describe("Header Encoding", () => {
    test("should detect internationalized mailbox addresses", async () => {
      const sender = await convertMessage(createTestMessage({
        sender: { address: "josé@example.com" },
      }));
      const recipient = await convertMessage(createTestMessage({
        bccRecipients: [{ address: "用户@example.com" }],
      }));
      const replyTo = await convertMessage(createTestMessage({
        replyRecipients: [{ address: "support@例え.テスト" }],
      }));

      assert.equal(sender.requiresSmtpUtf8, true);
      assert.equal(recipient.requiresSmtpUtf8, true);
      assert.equal(replyTo.requiresSmtpUtf8, true);
      assert.ok(sender.raw.includes("From: josé@example.com"));
    });

    test("should not require SMTPUTF8 for Unicode display names", async () => {
      const result = await convertMessage(createTestMessage({
        sender: { name: "José", address: "jose@example.com" },
        recipients: [{ name: "用户", address: "user@example.com" }],
      }));

      assert.equal(result.requiresSmtpUtf8, false);
      assert.ok(result.raw.includes("From: =?UTF-8?B?"));
      assert.ok(result.raw.includes("To: =?UTF-8?B?"));
    });

    test("should encode non-ASCII headers with RFC 2047", async () => {
      const message = createTestMessage({
        sender: { name: "김철수", address: "kim@example.com" },
        recipients: [{ name: "박영희", address: "park@example.com" }],
        subject: "한글 제목입니다",
      });

      const result = await convertMessage(message);

      // Should use RFC 2047 encoding for non-ASCII characters in subject
      assert.ok(result.raw.includes("Subject: =?UTF-8?B?"));
    });

    test("should leave ASCII headers unchanged", async () => {
      const message = createTestMessage({
        subject: "Plain ASCII Subject",
        sender: { name: "John Doe", address: "john@example.com" },
      });

      const result = await convertMessage(message);

      assert.ok(result.raw.includes("Subject: Plain ASCII Subject"));
      assert.ok(result.raw.includes("From: John Doe <john@example.com>"));
      assert.ok(!result.raw.includes("=?UTF-8?B?"));
    });

    test("should handle very long Korean subject lines", async () => {
      const longSubject = "이것은 매우 긴 한국어 제목입니다. ".repeat(5) +
        "테스트 메시지입니다.";
      const message = createTestMessage({
        subject: longSubject,
      });

      const result = await convertMessage(message);

      // Should encode with RFC 2047 and handle long lines
      assert.ok(result.raw.includes("Subject: =?UTF-8?B?"));

      // Should not exceed recommended line length
      const subjectLines = result.raw.split("\r\n").filter((line) =>
        line.startsWith("Subject:")
      );
      assert.ok(subjectLines.length >= 1);
    });

    test("should keep UTF-8 characters within one encoded word", async () => {
      const subject = "😀".repeat(40);
      const result = await convertMessage(createTestMessage({ subject }));
      const unfoldedHeaders = result.raw.split("\r\n\r\n", 1)[0].replace(
        /\r\n[ \t]+/g,
        " ",
      );
      const subjectLine = unfoldedHeaders.split("\r\n").find((line) =>
        line.startsWith("Subject: ")
      );

      assert.ok(subjectLine);
      const encodedWords = [...subjectLine.matchAll(
        /=\?UTF-8\?B\?([^?]+)\?=/g,
      )];
      assert.ok(encodedWords.length > 1);

      const decoder = new TextDecoder("utf-8", { fatal: true });
      const decodedWords = encodedWords.map((match) =>
        decoder.decode(Buffer.from(match[1], "base64"))
      );

      assert.strictEqual(decodedWords.join(""), subject);
    });

    test("should handle mixed CJK characters in sender names", async () => {
      const message = createTestMessage({
        sender: {
          name: "田中太郎 김철수 Wang Wei",
          address: "mixed@example.com",
        },
        subject: "Mixed CJK Test",
      });

      const result = await convertMessage(message);

      // Should encode sender name with mixed CJK characters
      assert.ok(result.raw.includes("From: =?UTF-8?B?"));
      assert.ok(result.raw.includes("Subject: Mixed CJK Test"));
    });

    test("should handle Japanese characters in headers", async () => {
      const message = createTestMessage({
        sender: { name: "田中太郎", address: "tanaka@example.com" },
        subject: "こんにちは、世界！",
      });

      const result = await convertMessage(message);

      // Should encode Japanese characters
      assert.ok(result.raw.includes("From: =?UTF-8?B?"));
      assert.ok(result.raw.includes("Subject: =?UTF-8?B?"));
    });

    test("should handle Chinese characters in headers", async () => {
      const message = createTestMessage({
        sender: { name: "王伟", address: "wang@example.com" },
        subject: "你好，世界！",
      });

      const result = await convertMessage(message);

      // Should encode Chinese characters
      assert.ok(result.raw.includes("From: =?UTF-8?B?"));
      assert.ok(result.raw.includes("Subject: =?UTF-8?B?"));
    });

    test("should handle emoji in headers", async () => {
      const message = createTestMessage({
        sender: { name: "John Doe 😀", address: "john@example.com" },
        subject: "Hello 👋 World 🌍",
      });

      const result = await convertMessage(message);

      // Should encode emoji characters
      assert.ok(result.raw.includes("From: =?UTF-8?B?"));
      assert.ok(result.raw.includes("Subject: =?UTF-8?B?"));
    });

    test("should handle custom headers with ASCII characters", async () => {
      const headers = new Headers();
      headers.set("X-Custom-Header", "Custom Value");
      headers.set("X-Mailer", "Test Mailer");
      headers.set("X-Custom-Info", "ASCII Info");

      const message = createTestMessage({ headers });
      const result = await convertMessage(message);

      // Should include all custom headers without encoding (ASCII only)
      assert.ok(result.raw.includes("x-custom-header: Custom Value"));
      assert.ok(result.raw.includes("x-mailer: Test Mailer"));
      assert.ok(result.raw.includes("x-custom-info: ASCII Info"));
    });

    test("should preserve long structured ASCII header values", async () => {
      const messageId = `<${"a".repeat(100)}@example.com>`;
      const headers = new Headers({ "In-Reply-To": messageId });
      const result = await convertMessage(createTestMessage({ headers }));

      assert.ok(result.raw.includes(`in-reply-to: ${messageId}`));
      assert.ok(!result.raw.includes("in-reply-to: =?UTF-8?B?"));
    });

    test("should reject custom header tokens beyond the hard limit", async () => {
      const headers = new Headers({ "X-Token": "a".repeat(1_000) });

      await assert.rejects(
        () => convertMessage(createTestMessage({ headers })),
        RangeError,
      );
    });

    test("should encode only display name in German umlaut addresses", async () => {
      const message = createTestMessage({
        sender: { name: "German ÄÖÜ", address: "info@example.com" },
        recipients: [{ name: "Müller Ümlauts", address: "user@example.com" }],
        ccRecipients: [{ name: "Größer", address: "cc@example.com" }],
        replyRecipients: [{
          name: "Straße Info",
          address: "reply@example.com",
        }],
      });

      const result = await convertMessage(message);

      // Should encode display names but leave email addresses unencoded
      assert.ok(result.raw.includes("From: =?UTF-8?B?"));
      assert.ok(result.raw.includes("<info@example.com>"));
      assert.ok(result.raw.includes("To: =?UTF-8?B?"));
      assert.ok(result.raw.includes("<user@example.com>"));
      assert.ok(result.raw.includes("Cc: =?UTF-8?B?"));
      assert.ok(result.raw.includes("<cc@example.com>"));
      assert.ok(result.raw.includes("Reply-To: =?UTF-8?B?"));
      assert.ok(result.raw.includes("<reply@example.com>"));

      // Email addresses should NOT be encoded
      assert.ok(!result.raw.includes("=?UTF-8?B?aW5mb0BleGFtcGxlLmNvbQ==?=")); // base64 of "info@example.com"
      assert.ok(!result.raw.includes("=?UTF-8?B?dXNlckBleGFtcGxlLmNvbQ==?=")); // base64 of "user@example.com"
    });

    test("should not encode addresses without display names", async () => {
      const message = createTestMessage({
        sender: { address: "sender@example.com" },
        recipients: [{ address: "recipient@example.com" }],
      });

      const result = await convertMessage(message);

      // Should not use any encoding for plain email addresses
      assert.ok(result.raw.includes("From: sender@example.com"));
      assert.ok(result.raw.includes("To: recipient@example.com"));
      assert.ok(!result.raw.includes("=?UTF-8?B?"));
    });
  });

  describe("Content Encoding", () => {
    test("should use quoted-printable for text content", async () => {
      const message = createTestMessage({
        content: { text: "Hello, 世界! This contains non-ASCII characters." },
      });

      const result = await convertMessage(message);

      assert.ok(
        result.raw.includes("Content-Transfer-Encoding: quoted-printable"),
      );

      // Should encode non-ASCII characters as quoted-printable
      assert.ok(result.raw.includes("=E4=B8=96=E7=95=8C")); // 世界 in UTF-8 quoted-printable
    });

    test("should handle special characters in quoted-printable", async () => {
      const message = createTestMessage({
        content: { text: "End=" },
      });

      const result = await convertMessage(message);

      // Should escape equals at end of line
      assert.ok(result.raw.includes("=3D")); // Escaped equals
    });

    test("should properly encode Korean characters in content", async () => {
      const message = createTestMessage({
        content: { text: "안녕하세요! 이것은 한국어 테스트입니다." },
      });

      const result = await convertMessage(message);

      assert.ok(
        result.raw.includes("Content-Transfer-Encoding: quoted-printable"),
      );

      // Should encode Korean characters as UTF-8 quoted-printable
      // 안녕하세요! = EC=95=88=EB=85=95=ED=95=98=EC=84=B8=EC=9A=94!
      assert.ok(
        result.raw.includes("=EC=95=88=EB=85=95=ED=95=98=EC=84=B8=EC=9A=94!"),
      );
    });

    test("should handle mixed ASCII and CJK characters", async () => {
      const message = createTestMessage({
        content: {
          text: "Hello 안녕하세요! This is a mixed text 한국어 test.",
        },
      });

      const result = await convertMessage(message);

      // Should contain both ASCII and encoded CJK characters
      assert.ok(result.raw.includes("Hello "));
      assert.ok(
        result.raw.includes("=EC=95=88=EB=85=95=ED=95=98=EC=84=B8=EC=9A=94!"),
      );
      assert.ok(result.raw.includes(" This is a mixed text "));
      assert.ok(result.raw.includes("=ED=95=9C=EA=B5=AD=EC=96=B4"));
      assert.ok(result.raw.includes(" test."));
    });

    test("should handle long lines with CJK characters", async () => {
      const longKoreanText = "이것은 매우 긴 한국어 텍스트입니다. ".repeat(10);
      const message = createTestMessage({
        content: { text: longKoreanText },
      });

      const result = await convertMessage(message);

      // Should contain soft line breaks for long lines
      assert.ok(result.raw.includes("=\r\n"));

      // Should properly encode Korean characters
      assert.ok(result.raw.includes("=EC=9D=B4=EA=B2=83=EC=9D=80")); // 이것은
    });

    test("should handle Japanese and Chinese characters", async () => {
      const message = createTestMessage({
        content: { text: "こんにちは 你好 안녕하세요" },
      });

      const result = await convertMessage(message);

      // Should encode Japanese hiragana (こんにちは)
      assert.ok(
        result.raw.includes("=E3=81=93=E3=82=93=E3=81=AB=E3=81=A1=E3=81=AF"),
      );

      // Should encode Chinese characters (你好)
      assert.ok(result.raw.includes("=E4=BD=A0=E5=A5=BD"));

      // Should encode Korean characters (안녕하세요) - may be split across lines due to line length
      const rawWithoutLineBreaks = result.raw.replace(/=\r\n/g, "");
      assert.ok(
        rawWithoutLineBreaks.includes(
          "=EC=95=88=EB=85=95=ED=95=98=EC=84=B8=EC=9A=94",
        ),
      );
    });

    test("should handle emoji and special Unicode characters", async () => {
      const message = createTestMessage({
        content: { text: "Hello 👋 世界 🌍 한국어 💬" },
      });

      const result = await convertMessage(message);

      // Should encode emoji properly
      assert.ok(result.raw.includes("=F0=9F=91=8B")); // 👋
      assert.ok(result.raw.includes("=F0=9F=8C=8D")); // 🌍
      assert.ok(result.raw.includes("=F0=9F=92=AC")); // 💬
    });

    test("should handle line breaks with CJK characters", async () => {
      const message = createTestMessage({
        content: { text: "첫 번째 줄\n두 번째 줄\r\n세 번째 줄" },
      });

      const result = await convertMessage(message);

      // Should preserve line breaks
      assert.ok(result.raw.includes("\n"));
      assert.ok(result.raw.includes("\r\n"));

      // Should encode Korean characters properly
      assert.ok(result.raw.includes("=EC=B2=AB")); // 첫
      assert.ok(result.raw.includes("=EB=91=90")); // 두
      assert.ok(result.raw.includes("=EC=84=B8")); // 세
    });
  });

  describe("Priority and Custom Headers", () => {
    test("should add priority headers for high priority", async () => {
      const message = createTestMessage({
        priority: "high",
      });

      const result = await convertMessage(message);

      assert.ok(result.raw.includes("X-Priority: 1"));
      assert.ok(result.raw.includes("X-MSMail-Priority: High"));
    });

    test("should add priority headers for low priority", async () => {
      const message = createTestMessage({
        priority: "low",
      });

      const result = await convertMessage(message);

      assert.ok(result.raw.includes("X-Priority: 5"));
      assert.ok(result.raw.includes("X-MSMail-Priority: Low"));
    });

    test("should not add priority headers for normal priority", async () => {
      const message = createTestMessage({
        priority: "normal",
      });

      const result = await convertMessage(message);

      assert.ok(!result.raw.includes("X-Priority:"));
      assert.ok(!result.raw.includes("X-MSMail-Priority:"));
    });

    test("should include custom headers", async () => {
      const headers = new Headers();
      headers.set("X-Custom-Header", "Custom Value");
      headers.set("X-Mailer", "Test Mailer");
      headers.set("X-ASCII-Header", "ASCII Value");

      const message = createTestMessage({ headers });
      const result = await convertMessage(message);

      assert.ok(result.raw.includes("x-custom-header: Custom Value"));
      assert.ok(result.raw.includes("x-mailer: Test Mailer"));
      assert.ok(result.raw.includes("x-ascii-header: ASCII Value"));
    });

    test("should handle reply-to addresses", async () => {
      const message = createTestMessage({
        replyRecipients: [
          { name: "Support", address: "support@example.com" },
          { address: "noreply@example.com" },
        ],
      });

      const result = await convertMessage(message);

      assert.ok(
        result.raw.includes(
          "Reply-To: Support <support@example.com>, noreply@example.com",
        ),
      );
    });
  });

  describe("Message ID Generation", () => {
    test("should generate unique message IDs", async () => {
      const message = createTestMessage();

      const result1 = await convertMessage(message);
      const result2 = await convertMessage(message);

      const messageId1 = result1.raw.match(/Message-ID: <([^>]+)>/)?.[1];
      const messageId2 = result2.raw.match(/Message-ID: <([^>]+)>/)?.[1];

      assert.ok(messageId1);
      assert.ok(messageId2);
      assert.notStrictEqual(messageId1, messageId2);

      // Should follow expected format
      assert.ok(messageId1.includes("@upyo.local"));
      assert.ok(messageId2.includes("@upyo.local"));
    });

    test("should generate valid date headers", async () => {
      const message = createTestMessage();
      const result = await convertMessage(message);

      const dateMatch = result.raw.match(/Date: (.+)/);
      assert.ok(dateMatch);

      const dateString = dateMatch[1];
      const parsedDate = new Date(dateString);
      assert.ok(!isNaN(parsedDate.getTime()));

      // Should be recent (within last minute)
      const now = new Date();
      const timeDiff = Math.abs(now.getTime() - parsedDate.getTime());
      assert.ok(timeDiff < 60000); // Less than 1 minute
    });
  });

  describe("Base64 Encoding", () => {
    test("should properly encode binary attachments", async () => {
      // Create a test binary file (ZIP signature + some data)
      const binaryContent = new Uint8Array([
        0x50,
        0x4B,
        0x03,
        0x04, // ZIP signature
        0x14,
        0x00,
        0x00,
        0x00, // Version, flags
        0x08,
        0x00,
        0x00,
        0x00, // Compression method, time
      ]);

      const message = createTestMessage({
        attachments: [
          {
            filename: "test.zip",
            content: binaryContent,
            contentType: "application/zip",
            contentId: "zip-file",
            inline: false,
          },
        ],
      });

      const result = await convertMessage(message);

      // Should contain base64 encoded content
      const expectedBase64 = Buffer.from(binaryContent).toString("base64");
      assert.ok(result.raw.includes(expectedBase64));

      // Should have proper line breaks (76 chars max per line)
      const base64Lines = result.raw.split("\r\n").filter((line) =>
        /^[A-Za-z0-9+/]+=*$/.test(line) && line.length > 50
      );

      if (base64Lines.length > 0) {
        base64Lines.forEach((line) => {
          assert.ok(
            line.length <= 76,
            `Base64 line too long: ${line.length} chars`,
          );
        });
      }
    });

    test("should handle large attachments without stack overflow", async () => {
      // Create a large attachment (500KB) to test the fixed encodeBase64 function
      const largeContent = new Uint8Array(500 * 1024); // 500KB
      // Fill with some pattern to make it realistic
      for (let i = 0; i < largeContent.length; i++) {
        largeContent[i] = i % 256;
      }

      const message = createTestMessage({
        attachments: [
          {
            filename: "large-file.pdf",
            content: largeContent,
            contentType: "application/pdf",
            contentId: "large-pdf",
            inline: false,
          },
        ],
      });

      // This should not throw a "Maximum call stack size exceeded" error
      const result = await convertMessage(message);

      // Should contain multipart structure
      assert.ok(result.raw.includes("Content-Type: multipart/mixed"));
      assert.ok(
        result.raw.includes(
          'Content-Type: application/pdf; name="large-file.pdf"',
        ),
      );
      assert.ok(result.raw.includes("Content-Transfer-Encoding: base64"));

      // Should have proper line breaks in base64 content (76 chars max per line)
      const base64Lines = result.raw.split("\r\n").filter((line) =>
        /^[A-Za-z0-9+/]+=*$/.test(line)
      );

      // Large file should result in many base64 lines
      assert.ok(
        base64Lines.length > 100,
        "Should have many base64 lines for large file",
      );

      // Each line should be 76 characters or less (except possibly the last line)
      base64Lines.forEach((line, index) => {
        if (index < base64Lines.length - 1) {
          assert.ok(
            line.length <= 76,
            `Base64 line ${index} too long: ${line.length} chars`,
          );
        }
      });
    });
  });

  describe("Edge Cases", () => {
    test("should handle empty content", async () => {
      const message = createTestMessage({
        content: { text: "" },
      });

      const result = await convertMessage(message);

      assert.strictEqual(result.envelope.from, "john@example.com");
      assert.ok(result.raw.includes("Content-Type: text/plain; charset=utf-8"));
      // Empty content should still result in valid message structure
      assert.ok(result.raw.includes("MIME-Version: 1.0"));
    });

    test("should handle message with no To recipients", async () => {
      const message = createTestMessage({
        recipients: [], // No To recipients
        ccRecipients: [{ address: "cc@example.com" }],
        bccRecipients: [{ address: "bcc@example.com" }],
      });

      const result = await convertMessage(message);

      // Envelope should contain all recipients
      assert.deepStrictEqual(result.envelope.to, [
        "cc@example.com",
        "bcc@example.com",
      ]);

      // Should have Cc header and empty To header (RFC compliant)
      assert.ok(result.raw.includes("Cc: cc@example.com"));
      assert.ok(result.raw.includes("To: "));
    });

    test("should handle very long lines in content", async () => {
      const longLine = "A".repeat(1000);
      const message = createTestMessage({
        content: { text: longLine },
      });

      const result = await convertMessage(message);

      // Should use quoted-printable encoding
      assert.ok(
        result.raw.includes("Content-Transfer-Encoding: quoted-printable"),
      );

      // Long lines should be broken with soft line breaks (RFC 2045 requirement)
      assert.ok(result.raw.includes("=\r\n"));

      // When soft line breaks are removed, should contain the original long line
      const rawWithoutSoftBreaks = result.raw.replace(/=\r\n/g, "");
      assert.ok(rawWithoutSoftBreaks.includes(longLine));
    });
  });
});

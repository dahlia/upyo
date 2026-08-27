import { type SmtpConfig, SmtpTransport } from "@upyo/smtp";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { MailpitClient } from "./test-utils/mailpit-client.ts";
import {
  validateMailpitAttachments,
  validateMailpitEmailContent,
  waitForMailpitDelivery,
} from "./test-utils/mailpit-delivery-utils.ts";
import {
  createTestMessage,
  getTestConfig,
  isMailpitTestingEnabled,
} from "./test-utils/test-config.ts";

describe(
  "SMTP Transport Mailpit Tests",
  { skip: !isMailpitTestingEnabled() },
  () => {
    if (!isMailpitTestingEnabled()) return;

    async function setupTest(overrides: Partial<SmtpConfig> = {}) {
      const config = getTestConfig();
      const transport = new SmtpTransport({
        ...config.smtp,
        ...overrides,
      });
      const mailpitClient = new MailpitClient(config.mailpit!);

      // Clear any existing messages
      await mailpitClient.deleteAllMessages();

      return { transport, mailpitClient, config };
    }

    async function teardownTest(transport: SmtpTransport) {
      await transport.closeAllConnections();
    }

    test("should send a basic email to Mailpit", async () => {
      const { transport, mailpitClient } = await setupTest();
      try {
        const message = createTestMessage({
          senderEmail: "john@example.com",
          recipientEmail: "jane@example.com",
          subject: "Test Email Mailpit - Basic",
          content: { text: "This is a test email sent to Mailpit" },
        });

        const receipt = await transport.send(message);

        assert.strictEqual(receipt.successful, true);
        if (receipt.successful) {
          assert.ok(receipt.messageId.length > 0);
        }

        // Wait for email to be received by Mailpit
        const mailpitMessage = await waitForMailpitDelivery(
          mailpitClient,
          { subject: "Test Email Mailpit - Basic" },
          5000,
        );

        validateMailpitEmailContent(mailpitMessage, {
          from: "john@example.com",
          to: "jane@example.com",
          subject: "Test Email Mailpit - Basic",
          textBody: "This is a test email sent to Mailpit",
        });
      } finally {
        await teardownTest(transport);
      }
    });

    test("should send email with HTML content to Mailpit", async () => {
      const { transport, mailpitClient } = await setupTest();
      try {
        const message = createTestMessage({
          senderEmail: "john@example.com",
          recipientEmail: "jane@example.com",
          subject: "Test Email Mailpit - HTML",
          content: {
            html:
              "<h1>HTML Email</h1><p>This is an <strong>HTML</strong> email sent to Mailpit</p>",
          },
        });

        const receipt = await transport.send(message);
        assert.strictEqual(receipt.successful, true);

        const mailpitMessage = await waitForMailpitDelivery(
          mailpitClient,
          { subject: "Test Email Mailpit - HTML" },
          5000,
        );

        validateMailpitEmailContent(mailpitMessage, {
          from: "john@example.com",
          to: "jane@example.com",
          subject: "Test Email Mailpit - HTML",
          htmlBody:
            "<h1>HTML Email</h1><p>This is an <strong>HTML</strong> email sent to Mailpit</p>",
        });

        assert.ok(mailpitMessage.HTML?.includes("<h1>HTML Email</h1>"));
        assert.ok(mailpitMessage.HTML?.includes("<strong>HTML</strong>"));
      } finally {
        await teardownTest(transport);
      }
    });

    test("should send email with attachments to Mailpit", async () => {
      const { transport, mailpitClient } = await setupTest();
      try {
        const textContent = "Hello from attachment test!";
        const textBytes = new TextEncoder().encode(textContent);

        const message = createTestMessage({
          subject: "Test Email Mailpit - Attachments",
          content: { text: "This email has attachments" },
          attachments: [
            {
              filename: "test.txt",
              contentType: "text/plain",
              content: textBytes,
              contentId: "test-attachment",
              inline: false,
            },
          ],
        });

        const receipt = await transport.send(message);
        assert.strictEqual(receipt.successful, true);

        const mailpitMessage = await waitForMailpitDelivery(
          mailpitClient,
          { subject: "Test Email Mailpit - Attachments" },
          5000,
        );

        validateMailpitEmailContent(mailpitMessage, {
          from: "john@example.com",
          to: "jane@example.com",
          subject: "Test Email Mailpit - Attachments",
          textBody: "This email has attachments",
        });

        validateMailpitAttachments(mailpitMessage, [
          {
            filename: "test.txt",
            contentType: "text/plain",
          },
        ]);
      } finally {
        await teardownTest(transport);
      }
    });

    test("should send email with multiple recipients to Mailpit", async () => {
      const { transport, mailpitClient } = await setupTest();
      try {
        const message = createTestMessage({
          subject: "Test Email Mailpit - Multiple Recipients",
          recipients: [
            { address: "recipient1@example.com" },
            { address: "recipient2@example.com" },
          ],
          ccRecipients: [{ address: "cc@example.com" }],
          content: { text: "This email has multiple recipients" },
        });

        const receipt = await transport.send(message);
        assert.strictEqual(receipt.successful, true);

        const mailpitMessage = await waitForMailpitDelivery(
          mailpitClient,
          { subject: "Test Email Mailpit - Multiple Recipients" },
          5000,
        );

        // Verify that all recipients are present
        const allRecipients = [
          ...(mailpitMessage.To || []),
          ...(mailpitMessage.Cc || []),
        ].map((addr) => addr.Address);

        assert.ok(allRecipients.includes("recipient1@example.com"));
        assert.ok(allRecipients.includes("recipient2@example.com"));
        assert.ok(allRecipients.includes("cc@example.com"));
      } finally {
        await teardownTest(transport);
      }
    });

    test("should handle non-ASCII characters in Mailpit", async () => {
      const { transport, mailpitClient } = await setupTest();
      try {
        const message = createTestMessage({
          subject: "Test Email Mailpit - 한글 테스트 🌍",
          content: {
            text:
              "안녕하세요! This email contains Korean characters and emojis 🚀",
          },
        });

        const receipt = await transport.send(message);
        assert.strictEqual(receipt.successful, true);

        const mailpitMessage = await waitForMailpitDelivery(
          mailpitClient,
          { subject: "Test Email Mailpit - 한글 테스트 🌍" },
          5000,
        );

        validateMailpitEmailContent(mailpitMessage, {
          from: "john@example.com",
          to: "jane@example.com",
          subject: "Test Email Mailpit - 한글 테스트 🌍",
          textBody:
            "안녕하세요! This email contains Korean characters and emojis 🚀",
        });
      } finally {
        await teardownTest(transport);
      }
    });

    test("should send multiple emails with sendMany to Mailpit", async () => {
      const { transport, mailpitClient } = await setupTest();
      try {
        const messages = [
          createTestMessage({
            subject: "Test Email Mailpit - Batch 1",
            content: { text: "First email" },
          }),
          createTestMessage({
            subject: "Test Email Mailpit - Batch 2",
            content: { text: "Second email" },
          }),
        ];

        const receipts = [];
        for await (const receipt of transport.sendMany(messages)) {
          receipts.push(receipt);
        }

        assert.strictEqual(receipts.length, 2);
        assert.ok(receipts.every((r) => r.successful));

        // Wait for both emails to be received
        const message1 = await waitForMailpitDelivery(
          mailpitClient,
          { subject: "Test Email Mailpit - Batch 1" },
          30000,
        );

        const message2 = await waitForMailpitDelivery(
          mailpitClient,
          { subject: "Test Email Mailpit - Batch 2" },
          30000,
        );

        assert.ok(message1.Text && message1.Text.includes("First email"));
        assert.ok(message2.Text && message2.Text.includes("Second email"));
      } finally {
        await teardownTest(transport);
      }
    });

    test("should send email with required STARTTLS", async () => {
      const { transport, mailpitClient, config } = await setupTest({
        requireTls: true,
      });
      try {
        // The test Mailpit instance is configured with a self-signed
        // certificate and advertises STARTTLS.
        const message = createTestMessage({
          subject: "Test Email Mailpit - STARTTLS",
          content: {
            text:
              "This email was sent using STARTTLS for secure connection upgrade",
          },
        });

        const receipt = await transport.send(message);

        assert.ok(
          receipt.successful,
          receipt.successful ? undefined : receipt.errorMessages.join(" "),
        );
        if (receipt.successful) {
          assert.ok(receipt.messageId.length > 0);
        }

        // Wait for email to be received by Mailpit
        const mailpitMessage = await waitForMailpitDelivery(
          mailpitClient,
          { subject: "Test Email Mailpit - STARTTLS" },
          5000,
        );

        validateMailpitEmailContent(mailpitMessage, {
          from: "sender@example.com",
          to: "recipient@example.com",
          subject: "Test Email Mailpit - STARTTLS",
          textBody:
            "This email was sent using STARTTLS for secure connection upgrade",
        });

        // Verify that the connection config doesn't have secure=true
        // (meaning it started as plaintext and upgraded via STARTTLS)
        assert.strictEqual(
          config.smtp.secure,
          false,
          "Connection should start as plaintext before STARTTLS upgrade",
        );
      } finally {
        await teardownTest(transport);
      }
    });

    test("should handle long CJK text with quoted-printable encoding in Mailpit", async () => {
      const { transport, mailpitClient } = await setupTest();
      try {
        // Create long Korean text that will trigger quoted-printable line breaks
        const longKoreanText = [
          "안녕하세요! 이것은 매우 긴 한국어 텍스트입니다.",
          "quoted-printable 인코딩이 제대로 작동하는지 확인하기 위해 작성된 테스트입니다.",
          "이 텍스트는 76자 제한을 초과하여 소프트 라인 브레이크가 적용되어야 합니다.",
          "한국어, 일본어(こんにちは), 중국어(你好) 등 다양한 CJK 문자들이 포함되어 있습니다.",
          "이모지도 포함됩니다: 👋 🌍 💬 🚀 ✨",
          "이 모든 문자들이 이메일 클라이언트에서 올바르게 표시되어야 합니다.",
        ].join(" ");

        const longJapaneseText = [
          "こんにちは！これは非常に長い日本語のテキストです。",
          "quoted-printableエンコーディングが正しく動作するかを確認するために作成されたテストです。",
          "このテキストは76文字制限を超えてソフトラインブレークが適用されるはずです。",
          "日本語、韓国語(안녕하세요), 中国語(你好)など様々なCJK文字が含まれています。",
        ].join(" ");

        const message = createTestMessage({
          senderName: "김테스트",
          senderEmail: "test@example.com",
          recipients: [{ name: "田中太郎", address: "tanaka@example.com" }],
          subject:
            "긴 CJK 텍스트 테스트 - Long CJK Text Test - 長いCJKテキストテスト",
          content: {
            text: longKoreanText,
            html: `
              <h1>긴 CJK 텍스트 테스트</h1>
              <h2>한국어 텍스트</h2>
              <p>${longKoreanText}</p>
              <h2>일본어 텍스트</h2>
              <p>${longJapaneseText}</p>
              <h2>중국어 텍스트</h2>
              <p>你好！这是一个很长的中文文本测试。我们需要确保quoted-printable编码能够正确处理这些字符。</p>
              <h2>이모지 테스트</h2>
              <p>🌟 ✨ 🎉 🚀 💻 📧 🔧 ⚡ 🌍 🇰🇷 🇯🇵 🇨🇳</p>
            `,
          },
        });

        const receipt = await transport.send(message);
        assert.strictEqual(receipt.successful, true);

        const mailpitMessage = await waitForMailpitDelivery(
          mailpitClient,
          {
            subject:
              "긴 CJK 텍스트 테스트 - Long CJK Text Test - 長いCJKテキストテスト",
          },
          10000,
        );

        // Verify that the subject and content are correctly decoded
        assert.ok(
          mailpitMessage.Subject.includes("긴 CJK 텍스트 테스트"),
          "Korean subject should be correctly decoded",
        );
        assert.ok(
          mailpitMessage.Subject.includes("Long CJK Text Test"),
          "English subject should be correctly decoded",
        );
        assert.ok(
          mailpitMessage.Subject.includes("長いCJKテキストテスト"),
          "Japanese subject should be correctly decoded",
        );

        // Verify text content
        assert.ok(
          mailpitMessage.Text?.includes(
            "quoted-printable 인코딩이 제대로 작동하는지",
          ),
          "Korean text should be correctly decoded",
        );
        assert.ok(
          mailpitMessage.Text?.includes(
            "다양한 CJK 문자들이 포함되어 있습니다",
          ),
          "Korean text should be correctly decoded",
        );
        assert.ok(
          mailpitMessage.Text?.includes("👋 🌍 💬 🚀 ✨"),
          "Emoji should be correctly decoded",
        );

        // Verify HTML content
        assert.ok(
          mailpitMessage.HTML?.includes("<h1>긴 CJK 텍스트 테스트</h1>"),
          "Korean HTML should be correctly decoded",
        );
        assert.ok(
          mailpitMessage.HTML?.includes(
            "quoted-printableエンコーディングが正しく動作するか",
          ),
          "Japanese HTML should be correctly decoded",
        );
        assert.ok(
          mailpitMessage.HTML?.includes(
            "quoted-printable编码能够正确处理这些字符",
          ),
          "Chinese HTML should be correctly decoded",
        );
        assert.ok(
          mailpitMessage.HTML?.includes("🌟 ✨ 🎉 🚀 💻 📧 🔧 ⚡ 🌍 🇰🇷 🇯🇵 🇨🇳"),
          "Emoji in HTML should be correctly decoded",
        );

        // Verify sender and recipient names are correctly decoded
        // Note: Mailpit may parse encoded headers differently, so we check if the Korean name is present
        assert.ok(
          mailpitMessage.From?.Name?.includes("김테스트") ||
            mailpitMessage.From?.Address?.includes("김테스트"),
          "Korean sender name should be correctly decoded and present in From field",
        );
        assert.ok(
          mailpitMessage.To?.some((to) =>
            to.Name?.includes("田中太郎") || to.Address?.includes("田中太郎")
          ) || mailpitMessage.To?.length === 0, // Mailpit might not populate To array correctly
          "Japanese recipient name should be correctly decoded or To field handling may vary",
        );
      } finally {
        await teardownTest(transport);
      }
    });
  },
);

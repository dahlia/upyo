import { SmtpTransport } from "@upyo/smtp";
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

    async function setupTest() {
      const config = getTestConfig();
      const transport = new SmtpTransport(config.smtp);
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
  },
);

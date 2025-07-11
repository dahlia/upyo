import { MailgunTransport } from "@upyo/mailgun";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  createTestMessage,
  getTestConfig,
  isE2eTestingEnabled,
} from "./test-utils/test-config.ts";
import {
  extractMessageId,
  validateBatchReceipts,
  validateErrorReceipt,
  validateMessageDelivery,
  waitForEmailProcessing,
} from "./test-utils/mailgun-delivery-utils.ts";

describe(
  "Mailgun Transport E2E Tests",
  { skip: !isE2eTestingEnabled() },
  () => {
    if (!isE2eTestingEnabled()) return;

    function setupTest() {
      const config = getTestConfig();
      const transport = new MailgunTransport(config.mailgun);
      return { transport, config };
    }

    test("should send a basic email via Mailgun API", async () => {
      const { transport } = setupTest();

      const message = createTestMessage({
        subject: "[E2E Test] Basic Email",
        content: {
          text: "This is a basic E2E test email sent via Mailgun API",
        },
      });

      const receipt = await transport.send(message);
      validateMessageDelivery(message, receipt, "[E2E Test] Basic Email");

      console.log(`✓ Email sent successfully with ID: ${receipt.messageId}`);

      // Wait for email processing
      await waitForEmailProcessing();
    });

    test("should send email with HTML content", async () => {
      const { transport } = setupTest();

      const message = createTestMessage({
        subject: "[E2E Test] HTML Email",
        content: {
          html:
            "<h1>HTML E2E Test</h1><p>This is an <strong>HTML</strong> email sent via Mailgun API</p>",
          text: "This is the plain text version of the HTML email",
        },
      });

      const receipt = await transport.send(message);
      validateMessageDelivery(message, receipt, "[E2E Test] HTML Email");

      console.log(
        `✓ HTML email sent successfully with ID: ${receipt.messageId}`,
      );

      await waitForEmailProcessing();
    });

    test("should send email with multiple recipients", async () => {
      const { transport, config } = setupTest();

      const message = createTestMessage({
        subject: "[E2E Test] Multiple Recipients",
        recipients: [
          { name: "Primary Recipient", address: config.testEmails.to },
        ],
        ccRecipients: [
          { name: "CC Recipient", address: config.testEmails.to },
        ],
        content: { text: "This email was sent to multiple recipients" },
      });

      const receipt = await transport.send(message);
      validateMessageDelivery(
        message,
        receipt,
        "[E2E Test] Multiple Recipients",
      );

      console.log(
        `✓ Multi-recipient email sent successfully with ID: ${receipt.messageId}`,
      );

      await waitForEmailProcessing();
    });

    test("should send email with attachments", async () => {
      const { transport } = setupTest();

      const textContent = "Hello from attachment test!";
      const textBytes = new TextEncoder().encode(textContent);

      const message = createTestMessage({
        subject: "[E2E Test] Email with Attachments",
        content: { text: "This email contains attachments" },
        attachments: [
          {
            filename: "test.txt",
            contentType: "text/plain",
            content: textBytes,
            contentId: "test-attachment",
            inline: false,
          },
          {
            filename: "test.json",
            contentType: "application/json",
            content: new TextEncoder().encode(JSON.stringify({ test: "data" })),
            contentId: "json-attachment",
            inline: false,
          },
        ],
      });

      const receipt = await transport.send(message);
      validateMessageDelivery(
        message,
        receipt,
        "[E2E Test] Email with Attachments",
      );

      console.log(
        `✓ Email with attachments sent successfully with ID: ${receipt.messageId}`,
      );

      await waitForEmailProcessing();
    });

    test("should send email with custom headers", async () => {
      const { transport } = setupTest();

      const headers = new Headers();
      headers.set("X-Custom-Header", "E2E-Test-Value");
      headers.set("X-Test-ID", `e2e-${Date.now()}`);

      const message = createTestMessage({
        subject: "[E2E Test] Custom Headers",
        content: { text: "This email contains custom headers" },
        headers,
      });

      const receipt = await transport.send(message);
      validateMessageDelivery(message, receipt, "[E2E Test] Custom Headers");

      console.log(
        `✓ Email with custom headers sent successfully with ID: ${receipt.messageId}`,
      );

      await waitForEmailProcessing();
    });

    test("should send email with priority settings", async () => {
      const { transport } = setupTest();

      const message = createTestMessage({
        subject: "[E2E Test] High Priority Email",
        content: { text: "This is a high priority email" },
        priority: "high",
      });

      const receipt = await transport.send(message);
      validateMessageDelivery(
        message,
        receipt,
        "[E2E Test] High Priority Email",
      );

      console.log(
        `✓ High priority email sent successfully with ID: ${receipt.messageId}`,
      );

      await waitForEmailProcessing();
    });

    test("should send email with tags", async () => {
      const { transport } = setupTest();

      const message = createTestMessage({
        subject: "[E2E Test] Tagged Email",
        content: { text: "This email has custom tags" },
        tags: ["e2e-test", "integration", "mailgun"],
      });

      const receipt = await transport.send(message);
      validateMessageDelivery(message, receipt, "[E2E Test] Tagged Email");

      console.log(
        `✓ Tagged email sent successfully with ID: ${receipt.messageId}`,
      );

      await waitForEmailProcessing();
    });

    test("should send email with reply-to address", async () => {
      const { transport, config } = setupTest();

      const message = createTestMessage({
        subject: "[E2E Test] Reply-To Email",
        content: { text: "This email has a reply-to address" },
        replyRecipients: [
          { name: "Reply To", address: config.testEmails.from },
        ],
      });

      const receipt = await transport.send(message);
      validateMessageDelivery(message, receipt, "[E2E Test] Reply-To Email");

      console.log(
        `✓ Reply-to email sent successfully with ID: ${receipt.messageId}`,
      );

      await waitForEmailProcessing();
    });

    test("should send email with Unicode characters", async () => {
      const { transport } = setupTest();

      const message = createTestMessage({
        subject: "[E2E Test] Unicode Test - 한글 테스트 🌍",
        content: {
          text:
            "안녕하세요! This email contains Korean characters and emojis 🚀📧",
        },
      });

      const receipt = await transport.send(message);
      validateMessageDelivery(
        message,
        receipt,
        "[E2E Test] Unicode Test - 한글 테스트 🌍",
      );

      console.log(
        `✓ Unicode email sent successfully with ID: ${receipt.messageId}`,
      );

      await waitForEmailProcessing();
    });

    test("should send multiple emails with sendMany", async () => {
      const { transport } = setupTest();

      const messages = [
        createTestMessage({
          subject: "[E2E Test] Batch Email 1",
          content: { text: "First email in batch" },
        }),
        createTestMessage({
          subject: "[E2E Test] Batch Email 2",
          content: { text: "Second email in batch" },
        }),
        createTestMessage({
          subject: "[E2E Test] Batch Email 3",
          content: { text: "Third email in batch" },
        }),
      ];

      const receipts = [];
      for await (const receipt of transport.sendMany(messages)) {
        receipts.push(receipt);
      }

      validateBatchReceipts(receipts, 3);

      console.log(`✓ Batch of ${receipts.length} emails sent successfully`);
      receipts.forEach((receipt, index) => {
        console.log(`  Email ${index + 1}: ${receipt.messageId}`);
      });

      await waitForEmailProcessing();
    });

    test("should handle invalid API key gracefully", async () => {
      const { config } = setupTest();

      const transport = new MailgunTransport({
        ...config.mailgun,
        apiKey: "invalid-api-key",
      });

      const message = createTestMessage({
        subject: "[E2E Test] Invalid API Key",
        content: { text: "This should fail" },
      });

      const receipt = await transport.send(message);
      validateErrorReceipt(receipt, ["forbidden"]);

      console.log(
        `✓ Invalid API key handled correctly: ${receipt.errorMessages[0]}`,
      );
    });

    test("should handle invalid domain gracefully", async () => {
      const { config } = setupTest();

      const transport = new MailgunTransport({
        ...config.mailgun,
        domain: "invalid-domain.example.com",
      });

      const message = createTestMessage({
        subject: "[E2E Test] Invalid Domain",
        content: { text: "This should fail" },
      });

      const receipt = await transport.send(message);
      validateErrorReceipt(receipt, ["forbidden"]);

      console.log(
        `✓ Invalid domain handled correctly: ${receipt.errorMessages[0]}`,
      );
    });

    test("should handle network timeout gracefully", async () => {
      const { config } = setupTest();

      const transport = new MailgunTransport({
        ...config.mailgun,
        timeout: 1, // 1ms timeout to force timeout
      });

      const message = createTestMessage({
        subject: "[E2E Test] Network Timeout",
        content: { text: "This should timeout" },
      });

      const receipt = await transport.send(message);
      validateErrorReceipt(receipt, ["aborted"]);

      console.log(
        `✓ Network timeout handled correctly: ${receipt.errorMessages[0]}`,
      );
    });

    test("should handle abort signal during send", async () => {
      const { transport } = setupTest();

      const message = createTestMessage({
        subject: "[E2E Test] Abort Signal",
        content: { text: "This should be aborted" },
      });

      const controller = new AbortController();

      // Abort immediately
      controller.abort();

      try {
        await transport.send(message, { signal: controller.signal });
        assert.fail("Expected AbortError to be thrown");
      } catch (error) {
        assert.ok(error instanceof Error);
        assert.equal(error.name, "AbortError");
        console.log(`✓ Abort signal handled correctly: ${error.message}`);
      }
    });

    test("should extract message ID correctly", async () => {
      const { transport } = setupTest();

      const message = createTestMessage({
        subject: "[E2E Test] Message ID Extraction",
        content: { text: "Testing message ID extraction" },
      });

      const receipt = await transport.send(message);
      validateMessageDelivery(
        message,
        receipt,
        "[E2E Test] Message ID Extraction",
      );

      const messageId = extractMessageId(receipt);
      assert.ok(messageId.length > 0, "Message ID should not be empty");
      assert.ok(
        !messageId.includes("<"),
        "Message ID should not contain angle brackets",
      );
      assert.ok(
        !messageId.includes(">"),
        "Message ID should not contain angle brackets",
      );

      console.log(`✓ Message ID extracted correctly: ${messageId}`);

      await waitForEmailProcessing();
    });
  },
);

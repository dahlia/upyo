import { SmtpTransport } from "@upyo/smtp";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { DkimConfig } from "./dkim/index.ts";
import { MailpitClient } from "./test-utils/mailpit-client.ts";
import { waitForMailpitDelivery } from "./test-utils/mailpit-delivery-utils.ts";
import {
  TEST_DKIM_DOMAIN,
  TEST_DKIM_PRIVATE_KEY,
  TEST_DKIM_SELECTOR,
} from "./test-utils/dkim-test-keys.ts";
import {
  createTestMessage,
  getTestConfig,
  isMailpitTestingEnabled,
} from "./test-utils/test-config.ts";

describe(
  "SMTP Transport DKIM Mailpit Tests",
  { skip: !isMailpitTestingEnabled() },
  () => {
    if (!isMailpitTestingEnabled()) return;

    const testDkimConfig: DkimConfig = {
      signatures: [
        {
          signingDomain: TEST_DKIM_DOMAIN,
          selector: TEST_DKIM_SELECTOR,
          privateKey: TEST_DKIM_PRIVATE_KEY,
        },
      ],
    };

    async function setupTest() {
      const config = getTestConfig();
      const transport = new SmtpTransport({
        ...config.smtp,
        dkim: testDkimConfig,
      });
      const mailpitClient = new MailpitClient(config.mailpit!);

      // Clear any existing messages
      await mailpitClient.deleteAllMessages();

      return { transport, mailpitClient, config };
    }

    async function teardownTest(transport: SmtpTransport) {
      await transport.closeAllConnections();
    }

    test("should send DKIM-signed email to Mailpit", async () => {
      const { transport, mailpitClient } = await setupTest();
      try {
        const message = createTestMessage({
          senderEmail: "john@example.com",
          recipientEmail: "jane@example.com",
          subject: "Test Email DKIM - Basic",
          content: { text: "This is a DKIM-signed email sent to Mailpit" },
        });

        const receipt = await transport.send(message);

        assert.strictEqual(receipt.successful, true);
        if (receipt.successful) {
          assert.ok(receipt.messageId.length > 0);
        }

        // Wait for email to be received by Mailpit
        const mailpitMessage = await waitForMailpitDelivery(
          mailpitClient,
          { subject: "Test Email DKIM - Basic" },
          5000,
        );

        // Get the raw message source to verify DKIM-Signature header
        const rawSource = await mailpitClient.getMessageSource(
          mailpitMessage.ID,
        );

        // Verify DKIM-Signature header is present
        assert.ok(
          rawSource.includes("DKIM-Signature:"),
          "Raw message should contain DKIM-Signature header",
        );

        // Verify required DKIM tags
        assert.ok(rawSource.includes("v=1"), "Should contain version tag");
        assert.ok(
          rawSource.includes("a=rsa-sha256"),
          "Should contain algorithm tag",
        );
        assert.ok(
          rawSource.includes(`d=${TEST_DKIM_DOMAIN}`),
          "Should contain signing domain tag",
        );
        assert.ok(
          rawSource.includes(`s=${TEST_DKIM_SELECTOR}`),
          "Should contain selector tag",
        );
        assert.ok(rawSource.includes("bh="), "Should contain body hash tag");
        assert.ok(rawSource.includes("b="), "Should contain signature tag");
      } finally {
        await teardownTest(transport);
      }
    });

    test("should include signed headers in DKIM-Signature", async () => {
      const { transport, mailpitClient } = await setupTest();
      try {
        const message = createTestMessage({
          subject: "Test Email DKIM - Headers",
          content: { text: "Testing DKIM signed headers" },
        });

        const receipt = await transport.send(message);
        assert.strictEqual(receipt.successful, true);

        const mailpitMessage = await waitForMailpitDelivery(
          mailpitClient,
          { subject: "Test Email DKIM - Headers" },
          5000,
        );

        const rawSource = await mailpitClient.getMessageSource(
          mailpitMessage.ID,
        );

        // Check h= tag includes standard headers
        const hMatch = rawSource.match(/h=([^;]+)/);
        assert.ok(hMatch, "Should have h= tag");

        const signedHeaders = hMatch[1].toLowerCase();
        assert.ok(signedHeaders.includes("from"), "Should sign From header");
        assert.ok(signedHeaders.includes("to"), "Should sign To header");
        assert.ok(
          signedHeaders.includes("subject"),
          "Should sign Subject header",
        );
        assert.ok(signedHeaders.includes("date"), "Should sign Date header");
      } finally {
        await teardownTest(transport);
      }
    });

    test("should send DKIM-signed HTML email to Mailpit", async () => {
      const { transport, mailpitClient } = await setupTest();
      try {
        const message = createTestMessage({
          subject: "Test Email DKIM - HTML",
          content: {
            html:
              "<h1>DKIM-Signed HTML Email</h1><p>This email is signed with DKIM</p>",
          },
        });

        const receipt = await transport.send(message);
        assert.strictEqual(receipt.successful, true);

        const mailpitMessage = await waitForMailpitDelivery(
          mailpitClient,
          { subject: "Test Email DKIM - HTML" },
          5000,
        );

        const rawSource = await mailpitClient.getMessageSource(
          mailpitMessage.ID,
        );

        // Verify DKIM-Signature is present
        assert.ok(
          rawSource.includes("DKIM-Signature:"),
          "Should contain DKIM-Signature header",
        );

        // Verify HTML content is preserved
        assert.ok(
          mailpitMessage.HTML?.includes("<h1>DKIM-Signed HTML Email</h1>"),
          "HTML content should be preserved",
        );
      } finally {
        await teardownTest(transport);
      }
    });

    test("should send DKIM-signed email with attachments to Mailpit", async () => {
      const { transport, mailpitClient } = await setupTest();
      try {
        const textContent = "DKIM test attachment content";
        const textBytes = new TextEncoder().encode(textContent);

        const message = createTestMessage({
          subject: "Test Email DKIM - Attachments",
          content: { text: "This DKIM-signed email has attachments" },
          attachments: [
            {
              filename: "dkim-test.txt",
              contentType: "text/plain",
              content: textBytes,
              contentId: "dkim-attachment",
              inline: false,
            },
          ],
        });

        const receipt = await transport.send(message);
        assert.strictEqual(receipt.successful, true);

        const mailpitMessage = await waitForMailpitDelivery(
          mailpitClient,
          { subject: "Test Email DKIM - Attachments" },
          5000,
        );

        const rawSource = await mailpitClient.getMessageSource(
          mailpitMessage.ID,
        );

        // Verify DKIM-Signature is present
        assert.ok(
          rawSource.includes("DKIM-Signature:"),
          "Should contain DKIM-Signature header",
        );

        // Verify attachment is present
        assert.ok(
          mailpitMessage.Attachments.length > 0,
          "Should have attachments",
        );
        assert.ok(
          mailpitMessage.Attachments.some((a) =>
            a.FileName === "dkim-test.txt"
          ),
          "Should have the expected attachment",
        );
      } finally {
        await teardownTest(transport);
      }
    });

    test("should send DKIM-signed email with non-ASCII content to Mailpit", async () => {
      const { transport, mailpitClient } = await setupTest();
      try {
        const message = createTestMessage({
          subject: "Test Email DKIM - 한글 테스트 🌍",
          content: {
            text:
              "안녕하세요! This DKIM-signed email contains Korean characters and emojis 🚀",
          },
        });

        const receipt = await transport.send(message);
        assert.strictEqual(receipt.successful, true);

        const mailpitMessage = await waitForMailpitDelivery(
          mailpitClient,
          { subject: "Test Email DKIM - 한글 테스트 🌍" },
          10000,
        );

        const rawSource = await mailpitClient.getMessageSource(
          mailpitMessage.ID,
        );

        // Verify DKIM-Signature is present
        assert.ok(
          rawSource.includes("DKIM-Signature:"),
          "Should contain DKIM-Signature header",
        );

        // Verify content is correctly decoded
        assert.ok(
          mailpitMessage.Text?.includes("안녕하세요"),
          "Korean content should be correctly decoded",
        );
        assert.ok(
          mailpitMessage.Text?.includes("🚀"),
          "Emoji should be correctly decoded",
        );
      } finally {
        await teardownTest(transport);
      }
    });

    test("should send multiple DKIM-signed emails with sendMany to Mailpit", async () => {
      const { transport, mailpitClient } = await setupTest();
      try {
        const messages = [
          createTestMessage({
            subject: "Test Email DKIM - Batch 1",
            content: { text: "First DKIM-signed email" },
          }),
          createTestMessage({
            subject: "Test Email DKIM - Batch 2",
            content: { text: "Second DKIM-signed email" },
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
          { subject: "Test Email DKIM - Batch 1" },
          30000,
        );

        const message2 = await waitForMailpitDelivery(
          mailpitClient,
          { subject: "Test Email DKIM - Batch 2" },
          30000,
        );

        // Verify both messages have DKIM-Signature
        const rawSource1 = await mailpitClient.getMessageSource(message1.ID);
        const rawSource2 = await mailpitClient.getMessageSource(message2.ID);

        assert.ok(
          rawSource1.includes("DKIM-Signature:"),
          "First message should have DKIM-Signature",
        );
        assert.ok(
          rawSource2.includes("DKIM-Signature:"),
          "Second message should have DKIM-Signature",
        );
      } finally {
        await teardownTest(transport);
      }
    });

    test("should verify DKIM-Signature header structure in Mailpit", async () => {
      const { transport, mailpitClient } = await setupTest();
      try {
        const message = createTestMessage({
          subject: "Test Email DKIM - Structure Verification",
          content: { text: "Testing DKIM signature structure" },
        });

        const receipt = await transport.send(message);
        assert.strictEqual(receipt.successful, true);

        const mailpitMessage = await waitForMailpitDelivery(
          mailpitClient,
          { subject: "Test Email DKIM - Structure Verification" },
          5000,
        );

        // Get headers to verify DKIM-Signature
        const headers = await mailpitClient.getMessageHeaders(
          mailpitMessage.ID,
        );

        // Check if DKIM-Signature header exists
        const dkimHeader = headers["Dkim-Signature"] ||
          headers["dkim-signature"];
        assert.ok(dkimHeader, "Should have DKIM-Signature header in headers");
        assert.ok(dkimHeader.length > 0, "DKIM-Signature should have value");

        // Verify the header value contains required tags
        const headerValue = dkimHeader[0];
        assert.ok(headerValue.includes("v=1"), "Should have version tag");
        assert.ok(
          headerValue.includes("a=rsa-sha256"),
          "Should have algorithm tag",
        );
        assert.ok(
          headerValue.includes("c=relaxed/relaxed"),
          "Should have canonicalization tag",
        );
      } finally {
        await teardownTest(transport);
      }
    });

    test("should use custom canonicalization in DKIM signature", async () => {
      const config = getTestConfig();
      const customDkimConfig: DkimConfig = {
        signatures: [
          {
            signingDomain: TEST_DKIM_DOMAIN,
            selector: TEST_DKIM_SELECTOR,
            privateKey: TEST_DKIM_PRIVATE_KEY,
            canonicalization: "simple/simple",
          },
        ],
      };

      const transport = new SmtpTransport({
        ...config.smtp,
        dkim: customDkimConfig,
      });
      const mailpitClient = new MailpitClient(config.mailpit!);

      await mailpitClient.deleteAllMessages();

      try {
        const message = createTestMessage({
          subject: "Test Email DKIM - Custom Canonicalization",
          content: { text: "Testing custom canonicalization" },
        });

        const receipt = await transport.send(message);
        assert.strictEqual(receipt.successful, true);

        const mailpitMessage = await waitForMailpitDelivery(
          mailpitClient,
          { subject: "Test Email DKIM - Custom Canonicalization" },
          5000,
        );

        const rawSource = await mailpitClient.getMessageSource(
          mailpitMessage.ID,
        );

        // Verify custom canonicalization is used
        assert.ok(
          rawSource.includes("c=simple/simple"),
          "Should use custom canonicalization",
        );
      } finally {
        await teardownTest(transport);
      }
    });
  },
);

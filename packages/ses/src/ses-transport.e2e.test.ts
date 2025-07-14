import { createMessage } from "@upyo/core";
import { SesTransport } from "@upyo/ses";
import assert from "node:assert/strict";
import process from "node:process";
import { test } from "node:test";

const shouldRunE2ETests = process.env.AWS_ACCESS_KEY_ID &&
  process.env.AWS_SECRET_ACCESS_KEY &&
  process.env.SES_FROM_EMAIL;

test(
  "SesTransport E2E: send simple message",
  { skip: !shouldRunE2ETests },
  async () => {
    if (!shouldRunE2ETests) return;

    const transport = new SesTransport({
      authentication: {
        type: "credentials",
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
      region: process.env.AWS_REGION || "us-east-1",
      retries: 1,
    });

    const message = createMessage({
      from: process.env.SES_FROM_EMAIL!,
      to: process.env.SES_TO_EMAIL || process.env.SES_FROM_EMAIL!,
      subject: "Upyo SES E2E Test - Simple Message",
      content: { text: "This is a test message from the Upyo SES transport." },
      tags: ["e2e-test", "simple"],
    });

    const receipt = await transport.send(message);

    assert.ok(
      receipt.successful,
      `Send failed: ${
        receipt.successful ? "" : receipt.errorMessages.join(", ")
      }`,
    );
    if (receipt.successful) {
      assert.ok(receipt.messageId.length > 0, "Message ID should not be empty");
      console.log(`✓ Message sent successfully with ID: ${receipt.messageId}`);
    }
  },
);

test(
  "SesTransport E2E: send HTML message",
  { skip: !shouldRunE2ETests },
  async () => {
    if (!shouldRunE2ETests) return;

    const transport = new SesTransport({
      authentication: {
        type: "credentials",
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
      region: process.env.AWS_REGION || "us-east-1",
      retries: 1,
    });

    const message = createMessage({
      from: process.env.SES_FROM_EMAIL!,
      to: process.env.SES_TO_EMAIL || process.env.SES_FROM_EMAIL!,
      subject: "Upyo SES E2E Test - HTML Message",
      content: {
        html:
          "<h1>HTML Test</h1><p>This is an <strong>HTML</strong> test message.</p>",
        text: "HTML Test\n\nThis is an HTML test message.",
      },
      tags: ["e2e-test", "html"],
      priority: "high",
    });

    const receipt = await transport.send(message);

    assert.ok(
      receipt.successful,
      `Send failed: ${
        receipt.successful ? "" : receipt.errorMessages.join(", ")
      }`,
    );
    if (receipt.successful) {
      assert.ok(receipt.messageId.length > 0, "Message ID should not be empty");
      console.log(
        `✓ HTML message sent successfully with ID: ${receipt.messageId}`,
      );
    }
  },
);

test(
  "SesTransport E2E: send multiple messages",
  { skip: !shouldRunE2ETests },
  async () => {
    if (!shouldRunE2ETests) return;

    const transport = new SesTransport({
      authentication: {
        type: "credentials",
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
      region: process.env.AWS_REGION || "us-east-1",
      retries: 1,
    });

    const messages = [
      createMessage({
        from: process.env.SES_FROM_EMAIL!,
        to: process.env.SES_TO_EMAIL || process.env.SES_FROM_EMAIL!,
        subject: "Upyo SES E2E Test - Batch Message 1",
        content: { text: "This is batch message 1." },
        tags: ["e2e-test", "batch"],
      }),
      createMessage({
        from: process.env.SES_FROM_EMAIL!,
        to: process.env.SES_TO_EMAIL || process.env.SES_FROM_EMAIL!,
        subject: "Upyo SES E2E Test - Batch Message 2",
        content: { text: "This is batch message 2." },
        tags: ["e2e-test", "batch"],
      }),
    ];

    const receipts = [];
    for await (const receipt of transport.sendMany(messages)) {
      receipts.push(receipt);
    }

    assert.equal(receipts.length, 2, "Should have 2 receipts");

    for (const [index, receipt] of receipts.entries()) {
      assert.ok(
        receipt.successful,
        `Message ${index + 1} failed: ${
          receipt.successful ? "" : receipt.errorMessages.join(", ")
        }`,
      );
      if (receipt.successful) {
        assert.ok(
          receipt.messageId.length > 0,
          `Message ${index + 1} ID should not be empty`,
        );
        console.log(
          `✓ Batch message ${
            index + 1
          } sent successfully with ID: ${receipt.messageId}`,
        );
      }
    }
  },
);

test(
  "SesTransport E2E: handle invalid recipient",
  { skip: !shouldRunE2ETests },
  async () => {
    if (!shouldRunE2ETests) return;

    const transport = new SesTransport({
      authentication: {
        type: "credentials",
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
      region: process.env.AWS_REGION || "us-east-1",
      retries: 1,
    });

    const message = createMessage({
      from: process.env.SES_FROM_EMAIL!,
      to: "invalid@nonexistent-domain-that-should-fail.invalid",
      subject: "Upyo SES E2E Test - Invalid Recipient",
      content: { text: "This should fail due to invalid recipient." },
      tags: ["e2e-test", "error"],
    });

    const receipt = await transport.send(message);

    assert.ok(!receipt.successful, "Send should have failed for invalid email");
    if (!receipt.successful) {
      assert.ok(receipt.errorMessages.length > 0, "Should have error messages");
      console.log(
        `✓ Invalid recipient correctly failed: ${
          receipt.errorMessages.join(", ")
        }`,
      );
    }
  },
);

test(
  "SesTransport E2E: send message with attachment",
  { skip: !shouldRunE2ETests },
  async () => {
    if (!shouldRunE2ETests) return;

    const transport = new SesTransport({
      authentication: {
        type: "credentials",
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
      region: process.env.AWS_REGION || "us-east-1",
      retries: 1,
    });

    // Create a simple text attachment
    const attachmentContent = new TextEncoder().encode(
      "This is a test attachment file.\nIt contains some sample text content.\n",
    );

    const attachment = {
      inline: false,
      filename: "test-attachment.txt",
      content: Promise.resolve(attachmentContent),
      contentType: "text/plain" as const,
      contentId: "test-attachment-id",
    };

    const message = createMessage({
      from: process.env.SES_FROM_EMAIL!,
      to: process.env.SES_TO_EMAIL || process.env.SES_FROM_EMAIL!,
      subject: "Upyo SES E2E Test - Message with Attachment",
      content: {
        html: `
          <h1>Attachment Test</h1>
          <p>This email contains a test attachment.</p>
          <p>The attachment is a simple text file that should be delivered along with this message.</p>
        `,
        text:
          "Attachment Test\n\nThis email contains a test attachment.\n\nThe attachment is a simple text file that should be delivered along with this message.",
      },
      attachments: [attachment],
      tags: ["e2e-test", "attachment"],
      priority: "normal",
    });

    const receipt = await transport.send(message);

    assert.ok(
      receipt.successful,
      `Send failed: ${
        receipt.successful ? "" : receipt.errorMessages.join(", ")
      }`,
    );
    if (receipt.successful) {
      assert.ok(receipt.messageId.length > 0, "Message ID should not be empty");
      console.log(
        `✓ Message with attachment sent successfully with ID: ${receipt.messageId}`,
      );
    }
  },
);

test(
  "SesTransport E2E: send bulk messages (concurrent)",
  { skip: !shouldRunE2ETests },
  async () => {
    if (!shouldRunE2ETests) return;

    const transport = new SesTransport({
      authentication: {
        type: "credentials",
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
      region: process.env.AWS_REGION || "us-east-1",
      retries: 1,
      batchSize: 3, // Small batch for testing
    });

    const messages = [
      createMessage({
        from: process.env.SES_FROM_EMAIL!,
        to: process.env.SES_TO_EMAIL || process.env.SES_FROM_EMAIL!,
        subject: "Upyo SES E2E Test - Bulk Message 1",
        content: { text: "This is bulk test message 1." },
        tags: ["e2e-test", "bulk"],
      }),
      createMessage({
        from: process.env.SES_FROM_EMAIL!,
        to: process.env.SES_TO_EMAIL || process.env.SES_FROM_EMAIL!,
        subject: "Upyo SES E2E Test - Bulk Message 2",
        content: { text: "This is bulk test message 2." },
        tags: ["e2e-test", "bulk"],
      }),
      createMessage({
        from: process.env.SES_FROM_EMAIL!,
        to: process.env.SES_TO_EMAIL || process.env.SES_FROM_EMAIL!,
        subject: "Upyo SES E2E Test - Bulk Message 3",
        content: { text: "This is bulk test message 3." },
        tags: ["e2e-test", "bulk"],
      }),
    ];

    const receipts = [];
    for await (const receipt of transport.sendMany(messages)) {
      receipts.push(receipt);
    }

    assert.equal(receipts.length, 3, "Should have 3 receipts");

    for (const [index, receipt] of receipts.entries()) {
      assert.ok(
        receipt.successful,
        `Bulk message ${index + 1} failed: ${
          receipt.successful ? "" : receipt.errorMessages.join(", ")
        }`,
      );
      if (receipt.successful) {
        assert.ok(
          receipt.messageId.length > 0,
          `Bulk message ${index + 1} ID should not be empty`,
        );
        console.log(
          `✓ Bulk message ${
            index + 1
          } sent successfully with ID: ${receipt.messageId}`,
        );
      }
    }
  },
);

import type { Message, Receipt } from "@upyo/core";
import { type EmailAddress, isEmailAddress } from "@upyo/core/address";
import { ResendTransport } from "./resend-transport.ts";
import { createTestConfig, type TestConfig } from "./test-utils/test-config.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

// Check if API key is available for E2E tests
function hasApiKey(): boolean {
  try {
    createTestConfig();
    return true;
  } catch {
    return false;
  }
}

// Shared test setup outside of describe blocks to avoid parallel execution issues
let transport: ResendTransport;
let testConfig: TestConfig;

// Check if API key is available and set up transport
function setupTransport(): boolean {
  try {
    testConfig = createTestConfig();
    transport = new ResendTransport(testConfig);
    return true;
  } catch (_error) {
    console.warn("Skipping E2E tests: Missing Resend API configuration");
    return false;
  }
}

// Helper function to get test recipient email
function getTestRecipient(): EmailAddress {
  if (testConfig.recipientEmail) {
    if (!isEmailAddress(testConfig.recipientEmail)) {
      throw new Error(
        `Invalid recipient email address: ${testConfig.recipientEmail}`,
      );
    }
    console.log(`📧 Using custom recipient: ${testConfig.recipientEmail}`);
    return testConfig.recipientEmail;
  }

  // For unverified accounts, we must use the account owner's email
  console.log(
    "📧 Using account owner email for testing: sweep-squishy-clad@duck.com",
  );
  return "sweep-squishy-clad@duck.com";
}

// Helper function to get test sender email
function getTestSender(): EmailAddress {
  if (testConfig.verifiedDomain) {
    const senderEmail = `test@${testConfig.verifiedDomain}` as EmailAddress;
    console.log(`📤 Using verified domain sender: ${senderEmail}`);
    return senderEmail;
  }

  // Use Resend's test domain for unverified accounts
  console.log("📤 Using Resend test domain: onboarding@resend.dev");
  return "onboarding@resend.dev";
}

// Check if we have a verified domain for full E2E testing
function hasVerifiedDomain(): boolean {
  return !!testConfig?.verifiedDomain;
}

// Helper function to add delay between API calls to respect rate limits
async function waitForRateLimit(): Promise<void> {
  // Resend allows 2 requests per second, so wait at least 1000ms between calls to be safe
  await new Promise((resolve) => setTimeout(resolve, 1000));
}

describe("ResendTransport E2E Test 1", {
  skip: !hasApiKey() || !setupTransport() || !hasVerifiedDomain(),
}, () => {
  it("should send and deliver email successfully", async () => {
    await waitForRateLimit();
    const recipientEmail = getTestRecipient();

    const message: Message = {
      sender: {
        address: getTestSender(),
        name: "Upyo Test",
      },
      recipients: [{
        address: recipientEmail,
        name: "Test Recipient",
      }],
      ccRecipients: [],
      bccRecipients: [],
      replyRecipients: [],
      subject: "Test Email from Upyo Resend Transport",
      content: {
        html:
          "<h1>Hello from Upyo!</h1><p>This is a test email sent using the Resend transport.</p>",
        text:
          "Hello from Upyo!\n\nThis is a test email sent using the Resend transport.",
      },
      attachments: [],
      priority: "normal",
      tags: ["test", "upyo"],
      headers: new Headers(),
    };

    const receipt = await transport.send(message);

    if (!receipt.successful) {
      console.log("❌ First test failed with errors:", receipt.errorMessages);
    }

    assert.equal(receipt.successful, true);
    if (receipt.successful) {
      assert.ok(receipt.messageId);
      assert.ok(receipt.messageId.length > 0);
      console.log(`✅ Message sent successfully with ID: ${receipt.messageId}`);
    }

    // Additional wait after API call
    await waitForRateLimit();
  });
});

describe("ResendTransport E2E Test 2", {
  skip: !hasApiKey() || !setupTransport() || !hasVerifiedDomain(),
}, () => {
  it("should send HTML email with text alternative", async () => {
    await waitForRateLimit();
    const recipientEmail = getTestRecipient();

    const message: Message = {
      sender: { address: getTestSender() },
      recipients: [{ address: recipientEmail }],
      ccRecipients: [],
      bccRecipients: [],
      replyRecipients: [],
      subject: "HTML Email Test",
      content: {
        html: `
          <html>
            <body>
              <h1 style="color: #333;">Welcome to Upyo!</h1>
              <p>This is an <strong>HTML email</strong> with formatting.</p>
              <ul>
                <li>Feature 1</li>
                <li>Feature 2</li>
                <li>Feature 3</li>
              </ul>
            </body>
          </html>
        `,
        text:
          "Welcome to Upyo!\n\nThis is an HTML email with formatting.\n\n- Feature 1\n- Feature 2\n- Feature 3",
      },
      attachments: [],
      priority: "normal",
      tags: [],
      headers: new Headers(),
    };

    const receipt = await transport.send(message);

    assert.equal(receipt.successful, true);
    if (receipt.successful) {
      console.log(`✅ HTML email sent with ID: ${receipt.messageId}`);
    }
  });
});

describe("ResendTransport E2E Test 3", {
  skip: !hasApiKey() || !setupTransport() || !hasVerifiedDomain(),
}, () => {
  it("should send high priority email", async () => {
    await waitForRateLimit();
    const recipientEmail = getTestRecipient();

    const message: Message = {
      sender: { address: getTestSender() },
      recipients: [{ address: recipientEmail }],
      ccRecipients: [],
      bccRecipients: [],
      replyRecipients: [],
      subject: "🚨 High Priority Email",
      content: {
        text: "This is a high priority email sent via Upyo Resend transport.",
      },
      attachments: [],
      priority: "high",
      tags: ["urgent"],
      headers: new Headers(),
    };

    const receipt = await transport.send(message);

    assert.equal(receipt.successful, true);
    if (receipt.successful) {
      console.log(`✅ High priority email sent with ID: ${receipt.messageId}`);
    }
  });
});

describe("ResendTransport E2E Test 4", {
  skip: !hasApiKey() || !setupTransport() || !hasVerifiedDomain(),
}, () => {
  it("should send email with attachments", async () => {
    await waitForRateLimit();
    const recipientEmail = getTestRecipient();

    // Create a simple text attachment
    const textContent = "This is a test attachment from Upyo Resend transport.";
    const textBuffer = new TextEncoder().encode(textContent);

    const message: Message = {
      sender: { address: getTestSender() },
      recipients: [{ address: recipientEmail }],
      ccRecipients: [],
      bccRecipients: [],
      replyRecipients: [],
      subject: "Email with Attachment",
      content: {
        text: "This email contains an attachment. Please check!",
      },
      attachments: [{
        filename: "test-document.txt",
        content: textBuffer,
        contentType: "text/plain",
        inline: false,
        contentId: "",
      }],
      priority: "normal",
      tags: ["attachment-test"],
      headers: new Headers(),
    };

    const receipt = await transport.send(message);

    assert.equal(receipt.successful, true);
    if (receipt.successful) {
      console.log(
        `✅ Email with attachment sent with ID: ${receipt.messageId}`,
      );
    }
  });
});

describe("ResendTransport E2E Test 5", {
  skip: !hasApiKey() || !setupTransport() || !hasVerifiedDomain(),
}, () => {
  it("should send multiple emails sequentially", async () => {
    await waitForRateLimit();
    const recipientEmail = getTestRecipient();

    const messages: Message[] = [
      {
        sender: { address: getTestSender() },
        recipients: [{ address: recipientEmail }],
        ccRecipients: [],
        bccRecipients: [],
        replyRecipients: [],
        subject: "Batch Test Email 1",
        content: { text: "This is the first email in the batch." },
        attachments: [],
        priority: "normal",
        tags: [],
        headers: new Headers(),
      },
      {
        sender: { address: getTestSender() },
        recipients: [{ address: recipientEmail }],
        ccRecipients: [],
        bccRecipients: [],
        replyRecipients: [],
        subject: "Batch Test Email 2",
        content: { text: "This is the second email in the batch." },
        attachments: [],
        priority: "normal",
        tags: [],
        headers: new Headers(),
      },
      {
        sender: { address: getTestSender() },
        recipients: [{ address: recipientEmail }],
        ccRecipients: [],
        bccRecipients: [],
        replyRecipients: [],
        subject: "Batch Test Email 3",
        content: { text: "This is the third email in the batch." },
        attachments: [],
        priority: "normal",
        tags: [],
        headers: new Headers(),
      },
    ];

    const receipts = [];
    for await (const receipt of transport.sendMany(messages)) {
      receipts.push(receipt);
    }

    assert.equal(receipts.length, 3);

    for (let i = 0; i < receipts.length; i++) {
      const receipt: Receipt = receipts[i];
      assert.equal(receipt.successful, true);
      if (receipt.successful) {
        console.log(
          `✅ Batch email ${i + 1} sent with ID: ${receipt.messageId}`,
        );
      }
    }
  });
});

describe("ResendTransport E2E Test 6", {
  skip: !hasApiKey() || !setupTransport(),
}, () => {
  it("should handle invalid sender address gracefully", async () => {
    const message: Message = {
      sender: { address: "invalid@invalid-domain-that-does-not-exist.com" },
      recipients: [{ address: "delivered@resend.dev" }],
      ccRecipients: [],
      bccRecipients: [],
      replyRecipients: [],
      subject: "Invalid Sender Test",
      content: { text: "This should fail due to invalid sender." },
      attachments: [],
      priority: "normal",
      tags: [],
      headers: new Headers(),
    };

    const receipt = await transport.send(message);

    assert.equal(receipt.successful, false);
    if (!receipt.successful) {
      assert.ok(receipt.errorMessages.length > 0);
      console.log(
        `✅ Invalid sender correctly rejected: ${receipt.errorMessages[0]}`,
      );
    }
  });
});

describe("ResendTransport E2E Test 7", {
  skip: !hasApiKey() || !setupTransport(),
}, () => {
  it("should handle malformed recipient address gracefully", async () => {
    const message: Message = {
      sender: { address: getTestSender() },
      recipients: [{ address: "invalid@invalid" as EmailAddress }],
      ccRecipients: [],
      bccRecipients: [],
      replyRecipients: [],
      subject: "Invalid Recipient Test",
      content: { text: "This should fail due to malformed recipient." },
      attachments: [],
      priority: "normal",
      tags: [],
      headers: new Headers(),
    };

    const receipt = await transport.send(message);

    assert.equal(receipt.successful, false);
    if (!receipt.successful) {
      assert.ok(receipt.errorMessages.length > 0);
      console.log(
        `✅ Invalid recipient correctly rejected: ${receipt.errorMessages[0]}`,
      );
    }
  });
});

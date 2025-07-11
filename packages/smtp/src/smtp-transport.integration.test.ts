import type { Message } from "@upyo/core";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { SmtpTransport } from "./smtp-transport.ts";
import { MockSmtpServer } from "./test-utils/mock-smtp-server.ts";

describe("SmtpTransport Integration Tests", () => {
  async function setupTest() {
    const server = new MockSmtpServer();
    const serverPort = await server.start();

    const transport = new SmtpTransport({
      host: "localhost",
      port: serverPort,
      secure: false,
      connectionTimeout: 5000,
      socketTimeout: 5000,
      pool: false, // Disable pooling for predictable test behavior
    });

    return { server, transport };
  }

  async function teardownTest(
    server: MockSmtpServer,
    transport: SmtpTransport,
  ) {
    await transport.closeAllConnections();
    await server.stop();
    // Give the event loop time to clean up resources
    await new Promise((resolve) => setTimeout(resolve, 1));
  }

  function createTestMessage(overrides: Partial<Message> = {}): Message {
    return {
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
    };
  }

  test("should send a basic email successfully", async () => {
    const { server, transport } = await setupTest();
    try {
      const message = createTestMessage();
      const receipt = await transport.send(message);

      assert.strictEqual(receipt.successful, true);
      assert.strictEqual(receipt.errorMessages.length, 0);
      assert.ok(receipt.messageId.length > 0);

      const receivedMessages = server.getReceivedMessages();
      assert.strictEqual(receivedMessages.length, 1);
      assert.strictEqual(receivedMessages[0].from, "john@example.com");
      assert.deepStrictEqual(receivedMessages[0].to, ["jane@example.com"]);
    } finally {
      await teardownTest(server, transport);
    }
  });

  test("should send email with HTML content", async () => {
    const { server, transport } = await setupTest();
    try {
      const message = createTestMessage({
        content: { html: "<h1>Hello, World!</h1>" },
      });

      const receipt = await transport.send(message);

      assert.strictEqual(receipt.successful, true);

      const receivedMessages = server.getReceivedMessages();
      assert.strictEqual(receivedMessages.length, 1);
      assert.ok(receivedMessages[0].data.includes("Content-Type: text/html"));
      assert.ok(receivedMessages[0].data.includes("<h1>Hello, World!</h1>"));
    } finally {
      await teardownTest(server, transport);
    }
  });

  test("should send email with multiple recipients", async () => {
    const { server, transport } = await setupTest();
    try {
      const message = createTestMessage({
        recipients: [
          { address: "recipient1@example.com" },
          { address: "recipient2@example.com" },
        ],
        ccRecipients: [{ address: "cc@example.com" }],
        bccRecipients: [{ address: "bcc@example.com" }],
      });

      const receipt = await transport.send(message);

      assert.strictEqual(receipt.successful, true);

      const receivedMessages = server.getReceivedMessages();
      assert.strictEqual(receivedMessages.length, 1);
      assert.deepStrictEqual(receivedMessages[0].to, [
        "recipient1@example.com",
        "recipient2@example.com",
        "cc@example.com",
        "bcc@example.com",
      ]);
    } finally {
      await teardownTest(server, transport);
    }
  });

  test("should send email with attachments", async () => {
    const { server, transport } = await setupTest();
    try {
      const message = createTestMessage({
        attachments: [
          {
            filename: "test.txt",
            contentType: "text/plain",
            content: new Uint8Array([72, 101, 108, 108, 111]), // "Hello"
            contentId: "attachment1",
            inline: false,
          },
        ],
      });

      const receipt = await transport.send(message);

      assert.strictEqual(receipt.successful, true);

      const receivedMessages = server.getReceivedMessages();
      assert.strictEqual(receivedMessages.length, 1);
      assert.ok(
        receivedMessages[0].data.includes("Content-Type: multipart/mixed"),
      );
      assert.ok(receivedMessages[0].data.includes('filename="test.txt"'));
      assert.ok(
        receivedMessages[0].data.includes("Content-Transfer-Encoding: base64"),
      );
    } finally {
      await teardownTest(server, transport);
    }
  });

  test("should send multiple emails with sendMany", async () => {
    const { server, transport } = await setupTest();
    try {
      const messages = [
        createTestMessage({
          subject: "First email",
          content: { text: "First email content" },
        }),
        createTestMessage({
          subject: "Second email",
          content: { text: "Second email content" },
        }),
      ];

      const receipts = [];
      for await (const receipt of transport.sendMany(messages)) {
        receipts.push(receipt);
      }

      assert.strictEqual(receipts.length, 2);
      assert.ok(receipts.every((r) => r.successful));

      const receivedMessages = server.getReceivedMessages();
      assert.strictEqual(receivedMessages.length, 2);
    } finally {
      await teardownTest(server, transport);
    }
  });

  test("should handle custom headers", async () => {
    const { server, transport } = await setupTest();
    try {
      const headers = new Headers();
      headers.set("X-Custom-Header", "Custom Value");
      headers.set("X-Mailer", "Test Mailer");

      const message = createTestMessage({ headers });

      const receipt = await transport.send(message);

      assert.strictEqual(receipt.successful, true);

      const receivedMessages = server.getReceivedMessages();
      const receivedMessage = receivedMessages[0];

      assert.ok(receivedMessage.data.includes("x-custom-header: Custom Value"));
      assert.ok(receivedMessage.data.includes("x-mailer: Test Mailer"));
    } finally {
      await teardownTest(server, transport);
    }
  });

  test("should handle server errors gracefully", async () => {
    const { server, transport } = await setupTest();
    try {
      server.setResponse("MAIL", { code: 550, message: "Sender rejected" });

      const message = createTestMessage();
      const receipt = await transport.send(message);

      assert.strictEqual(receipt.successful, false);
      assert.ok(receipt.errorMessages.length > 0);
      assert.ok(receipt.errorMessages[0].includes("MAIL FROM failed"));
    } finally {
      await teardownTest(server, transport);
    }
  });

  test("should handle non-ASCII characters in headers and content", async () => {
    const { server, transport } = await setupTest();
    try {
      const message = createTestMessage({
        subject: "테스트 제목 (Korean Subject)",
        content: { text: "안녕하세요! Hello World! 🌍" },
      });

      const receipt = await transport.send(message);

      assert.strictEqual(receipt.successful, true);

      const receivedMessages = server.getReceivedMessages();
      const receivedMessage = receivedMessages[0];

      // Subject should be RFC 2047 encoded
      assert.ok(receivedMessage.data.includes("Subject: =?UTF-8?B?"));

      // Content should be quoted-printable encoded
      assert.ok(
        receivedMessage.data.includes(
          "Content-Transfer-Encoding: quoted-printable",
        ),
      );
    } finally {
      await teardownTest(server, transport);
    }
  });

  test("should handle mixed HTML and text content", async () => {
    const { server, transport } = await setupTest();
    try {
      const message = createTestMessage({
        content: {
          text: "Hello, World! (Plain text version)",
          html: "<h1>Hello, World!</h1><p>HTML version</p>",
        },
      });

      const receipt = await transport.send(message);

      assert.strictEqual(receipt.successful, true);

      const receivedMessages = server.getReceivedMessages();
      const receivedMessage = receivedMessages[0];

      // Should create multipart/alternative structure
      assert.ok(
        receivedMessage.data.includes("Content-Type: multipart/alternative"),
      );
      assert.ok(receivedMessage.data.includes("Content-Type: text/plain"));
      assert.ok(receivedMessage.data.includes("Content-Type: text/html"));
    } finally {
      await teardownTest(server, transport);
    }
  });

  test("should handle multiple attachment types", async () => {
    const { server, transport } = await setupTest();
    try {
      const message = createTestMessage({
        attachments: [
          {
            filename: "document.pdf",
            contentType: "application/pdf",
            content: new Uint8Array([37, 80, 68, 70]), // PDF header
            contentId: "doc1",
            inline: false,
          },
          {
            filename: "image.png",
            contentType: "image/png",
            content: new Uint8Array([137, 80, 78, 71]), // PNG header
            contentId: "img1",
            inline: true,
          },
        ],
      });

      const receipt = await transport.send(message);

      assert.strictEqual(receipt.successful, true);

      const receivedMessages = server.getReceivedMessages();
      const receivedMessage = receivedMessages[0];

      assert.ok(receivedMessage.data.includes("Content-Type: multipart/mixed"));
      assert.ok(receivedMessage.data.includes('filename="document.pdf"'));
      assert.ok(receivedMessage.data.includes('filename="image.png"'));
      assert.ok(
        receivedMessage.data.includes("Content-Disposition: attachment"),
      );
      assert.ok(receivedMessage.data.includes("Content-Disposition: inline"));
      assert.ok(receivedMessage.data.includes("Content-ID: <img1>"));
    } finally {
      await teardownTest(server, transport);
    }
  });

  test("should handle priority levels correctly", async () => {
    const { server, transport } = await setupTest();
    try {
      // Test high priority
      const highPriorityMessage = createTestMessage({
        priority: "high",
        subject: "High Priority Message",
      });

      await transport.send(highPriorityMessage);

      // Test low priority
      const lowPriorityMessage = createTestMessage({
        priority: "low",
        subject: "Low Priority Message",
      });

      await transport.send(lowPriorityMessage);

      const receivedMessages = server.getReceivedMessages();
      assert.strictEqual(receivedMessages.length, 2);

      const highPriorityReceived = receivedMessages[0];
      const lowPriorityReceived = receivedMessages[1];

      // High priority should have priority headers
      assert.ok(highPriorityReceived.data.includes("X-Priority: 1"));
      assert.ok(highPriorityReceived.data.includes("X-MSMail-Priority: High"));

      // Low priority should have priority headers
      assert.ok(lowPriorityReceived.data.includes("X-Priority: 5"));
      assert.ok(lowPriorityReceived.data.includes("X-MSMail-Priority: Low"));
    } finally {
      await teardownTest(server, transport);
    }
  });

  test("should handle reply-to addresses", async () => {
    const { server, transport } = await setupTest();
    try {
      const message = createTestMessage({
        replyRecipients: [
          { name: "Support", address: "support@example.com" },
          { name: "Sales", address: "sales@example.com" },
        ],
      });

      const receipt = await transport.send(message);

      assert.strictEqual(receipt.successful, true);

      const receivedMessages = server.getReceivedMessages();
      const receivedMessage = receivedMessages[receivedMessages.length - 1];

      assert.ok(
        receivedMessage.data.includes(
          "Reply-To: Support <support@example.com>, Sales <sales@example.com>",
        ),
      );
    } finally {
      await teardownTest(server, transport);
    }
  });
});

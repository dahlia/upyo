import type { Message, Receipt } from "@upyo/core";
import { type SmtpConfig, type SmtpReceipt, SmtpTransport } from "@upyo/smtp";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { MockSmtpServer } from "./test-utils/mock-smtp-server.ts";

describe("SmtpTransport Integration Tests", () => {
  async function setupTest(overrides: Partial<SmtpConfig> = {}) {
    const server = new MockSmtpServer();
    const serverPort = await server.start();

    const transport = new SmtpTransport({
      host: "localhost",
      port: serverPort,
      secure: false,
      connectionTimeout: 5000,
      socketTimeout: 5000,
      pool: false, // Disable pooling for predictable test behavior
      ...overrides,
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

  test("should reject sendMany when aborted after sending has started", async () => {
    const { server, transport } = await setupTest();
    try {
      const controller = new AbortController();

      const messages = async function* () {
        yield createTestMessage();
        yield createTestMessage();
      };

      const receipts: Receipt[] = [];
      await assert.rejects(
        (async () => {
          for await (
            const receipt of transport.sendMany(messages(), {
              signal: controller.signal,
            })
          ) {
            receipts.push(receipt);
            // Cancel once the first message has been delivered.
            controller.abort();
          }
        })(),
        (error: unknown) =>
          error instanceof DOMException && error.name === "AbortError",
      );

      // The first message succeeded; cancellation then rejected rather than
      // yielding a failed receipt.
      assert.equal(receipts.length, 1);
      assert.ok(receipts[0].successful);
    } finally {
      await teardownTest(server, transport);
    }
  });

  test("should send a basic email successfully", async () => {
    const { server, transport } = await setupTest();
    try {
      const message = createTestMessage();
      const receipt = await transport.send(message);

      assert.strictEqual(receipt.successful, true);
      if (receipt.successful) {
        assert.ok(receipt.messageId.length > 0);
      }

      const receivedMessages = server.getReceivedMessages();
      assert.strictEqual(receivedMessages.length, 1);
      assert.strictEqual(receivedMessages[0].from, "john@example.com");
      assert.deepStrictEqual(receivedMessages[0].to, ["jane@example.com"]);
    } finally {
      await teardownTest(server, transport);
    }
  });

  test("should serialize RFC 3461 DSN parameters per recipient", async () => {
    const { server, transport } = await setupTest();
    try {
      server.setCapabilities(["dSn", "PIPELINING"]);
      const message = createTestMessage({
        recipients: [{ address: "jane+archive=2026@example.com" }],
        ccRecipients: [{ address: "johnny@example.com" }],
        bccRecipients: [{ address: "hidden@example.com" }],
      });

      const receipt = await transport.send(message, {
        dsn: {
          envelopeId: "campaign+42=alpha beta",
          return: "headers",
          recipients: {
            "jane+archive=2026@example.com": {
              notify: ["success", "failure", "delay"],
              originalRecipient: "jane+archive=2026@example.com",
            },
            "johnny@example.com": { notify: ["never"] },
            "hidden@example.com": {
              notify: ["failure"],
              originalRecipient: "hidden@example.com",
            },
          },
        },
      });

      assert.ok(receipt.successful);
      assert.deepEqual(
        server.getReceivedCommands().filter((command) =>
          command.startsWith("MAIL FROM:") || command.startsWith("RCPT TO:")
        ),
        [
          "MAIL FROM:<john@example.com> RET=HDRS " +
          "ENVID=campaign+2B42+3Dalpha+20beta",
          "RCPT TO:<jane+archive=2026@example.com> " +
          "NOTIFY=SUCCESS,FAILURE,DELAY " +
          "ORCPT=rfc822;jane+2Barchive+3D2026@example.com",
          "RCPT TO:<johnny@example.com> NOTIFY=NEVER",
          "RCPT TO:<hidden@example.com> NOTIFY=FAILURE " +
          "ORCPT=rfc822;hidden@example.com",
        ],
      );
      const delivered = server.getReceivedMessages()[0];
      assert.ok(!delivered.data.includes("ENVID="));
      assert.ok(!delivered.data.includes("NOTIFY="));
      assert.ok(!delivered.data.includes("ORCPT="));
    } finally {
      await teardownTest(server, transport);
    }
  });

  test("should fail before MAIL FROM when DSN is unavailable", async () => {
    const { server, transport } = await setupTest({ pool: true });
    try {
      server.setCapabilities(["HELP"]);

      const unsupported = await transport.send(createTestMessage(), {
        dsn: {
          recipients: {
            "jane@example.com": { notify: ["failure"] },
          },
        },
      });
      const ordinary = await transport.send(createTestMessage());

      assert.ok(!unsupported.successful);
      if (!unsupported.successful) {
        assert.equal(unsupported.retryable, false);
        assert.equal(
          unsupported.errors?.[0]?.code,
          "smtp.dsn-unsupported",
        );
        assert.equal(
          unsupported.errors?.[0]?.category,
          "configuration",
        );
      }
      assert.ok(ordinary.successful);
      assert.equal(server.getConnectionCount(), 1);
      assert.deepEqual(
        server.getReceivedCommands().filter((command) =>
          command.startsWith("MAIL FROM:")
        ),
        ["MAIL FROM:<john@example.com>"],
      );
    } finally {
      await teardownTest(server, transport);
    }
  });

  test("should reject incompatible DSN notification conditions", async () => {
    const { server, transport } = await setupTest();
    try {
      const receipt = await transport.send(createTestMessage(), {
        dsn: {
          recipients: {
            "jane@example.com": {
              notify: ["never", "failure"],
            },
          },
        },
      });

      assert.ok(!receipt.successful);
      if (!receipt.successful) {
        assert.match(receipt.errorMessages[0], /NEVER.*by itself/);
        assert.equal(receipt.retryable, false);
        assert.equal(receipt.errors?.[0]?.code, "smtp.dsn-invalid");
        assert.equal(receipt.errors?.[0]?.category, "validation");
      }
      assert.ok(
        !server.getReceivedCommands().some((command) =>
          command.startsWith("MAIL FROM:")
        ),
      );
    } finally {
      await teardownTest(server, transport);
    }
  });

  test("should reject invalid DSN xtext before connecting", async () => {
    const { server, transport } = await setupTest();
    try {
      const receipt = await transport.send(createTestMessage(), {
        dsn: { envelopeId: "unicode-안녕" },
      });

      assert.ok(!receipt.successful);
      if (!receipt.successful) {
        assert.match(receipt.errorMessages[0], /printable US-ASCII/);
        assert.equal(receipt.errors?.[0]?.code, "smtp.dsn-invalid");
      }
      assert.equal(server.getConnectionCount(), 0);
    } finally {
      await teardownTest(server, transport);
    }
  });

  test("should reject DSN options for a non-recipient address", async () => {
    const { server, transport } = await setupTest();
    try {
      const receipt = await transport.send(createTestMessage(), {
        dsn: {
          recipients: {
            "other@example.com": { notify: ["failure"] },
          },
        },
      });

      assert.ok(!receipt.successful);
      if (!receipt.successful) {
        assert.match(receipt.errorMessages[0], /not an envelope recipient/);
        assert.equal(receipt.errors?.[0]?.code, "smtp.dsn-invalid");
      }
      assert.equal(server.getConnectionCount(), 0);
    } finally {
      await teardownTest(server, transport);
    }
  });

  test("should continue sendMany after invalid per-message DSN options", async () => {
    const { server, transport } = await setupTest();
    try {
      server.setCapabilities(["DSN"]);
      const messages = [
        createTestMessage(),
        createTestMessage({
          recipients: [{ address: "other@example.com" }],
        }),
        createTestMessage(),
      ];
      const receipts: SmtpReceipt[] = [];

      for await (
        const receipt of transport.sendMany(messages, {
          dsn: {
            recipients: {
              "jane@example.com": { notify: ["failure"] },
            },
          },
        })
      ) {
        receipts.push(receipt);
      }

      assert.equal(receipts.length, 3);
      assert.ok(receipts[0].successful);
      assert.ok(!receipts[1].successful);
      if (!receipts[1].successful) {
        assert.equal(receipts[1].errors?.[0]?.code, "smtp.dsn-invalid");
        assert.equal(receipts[1].errors?.[0]?.category, "validation");
      }
      assert.ok(receipts[2].successful);
      assert.equal(server.getConnectionCount(), 1);
      assert.deepEqual(
        server.getReceivedCommands().filter((command) =>
          command.startsWith("RCPT TO:")
        ),
        [
          "RCPT TO:<jane@example.com> NOTIFY=FAILURE",
          "RCPT TO:<jane@example.com> NOTIFY=FAILURE",
        ],
      );
    } finally {
      await teardownTest(server, transport);
    }
  });

  test("should fail before MAIL FROM when the SIZE limit is exceeded", async () => {
    const { server, transport } = await setupTest();
    try {
      server.setCapabilities(["SIZE 500"]);

      const receipt = await transport.send(createTestMessage({
        content: { text: "x".repeat(1000) },
      }));

      assert.ok(!receipt.successful);
      if (!receipt.successful) {
        assert.match(receipt.errorMessages[0], /Message size \d+ octets/);
        assert.equal(receipt.retryable, false);
        assert.equal(
          receipt.errors?.[0]?.code,
          "smtp.message-size-exceeded",
        );
        assert.equal(receipt.errors?.[0]?.category, "rejected");
        const providerDetails = receipt.errors?.[0]?.providerDetails;
        if (providerDetails == null || typeof providerDetails !== "object") {
          assert.fail("Expected provider details for the SIZE rejection.");
        }
        assert.ok("maximumSize" in providerDetails);
        assert.equal(providerDetails.maximumSize, "500");
        assert.ok("actualSize" in providerDetails);
        assert.equal(typeof providerDetails.actualSize, "number");
      }
      assert.ok(
        !server.getReceivedCommands().some((command) =>
          command.startsWith("MAIL FROM:")
        ),
      );
    } finally {
      await teardownTest(server, transport);
    }
  });

  test("should return a non-retryable failure when SMTPUTF8 is unavailable", async () => {
    const { server, transport } = await setupTest({ pool: true });
    try {
      server.setCapabilities(["8BITMIME"]);

      const unsupported = await transport.send(createTestMessage({
        sender: { address: "josé@example.com" },
      }));
      const accepted = await transport.send(createTestMessage());

      assert.ok(!unsupported.successful);
      if (!unsupported.successful) {
        assert.equal(unsupported.retryable, false);
        assert.equal(
          unsupported.errors?.[0]?.code,
          "smtp.smtputf8-unsupported",
        );
        assert.equal(unsupported.errors?.[0]?.category, "configuration");
      }
      assert.ok(accepted.successful);
      assert.equal(server.getConnectionCount(), 1);
      assert.deepEqual(
        server.getReceivedCommands().filter((command) =>
          command.startsWith("MAIL FROM:")
        ),
        ["MAIL FROM:<john@example.com>"],
      );
    } finally {
      await teardownTest(server, transport);
    }
  });

  test("should continue sendMany after a local SIZE rejection", async () => {
    const { server, transport } = await setupTest();
    try {
      server.setCapabilities(["SIZE 1000"]);
      const messages = [
        createTestMessage({ content: { text: "x".repeat(2000) } }),
        createTestMessage({ content: { text: "small message" } }),
      ];

      const receipts: SmtpReceipt[] = [];
      for await (const receipt of transport.sendMany(messages)) {
        receipts.push(receipt);
      }

      assert.equal(receipts.length, 2);
      assert.ok(!receipts[0].successful);
      assert.ok(receipts[1].successful);
      assert.equal(server.getReceivedMessages().length, 1);
      assert.equal(
        server.getReceivedCommands().filter((command) =>
          command.startsWith("MAIL FROM:")
        ).length,
        1,
      );
    } finally {
      await teardownTest(server, transport);
    }
  });

  test("should reuse a pooled connection after a local SIZE rejection", async () => {
    const { server, transport } = await setupTest({ pool: true });
    try {
      server.setCapabilities(["SIZE 1000"]);

      const oversized = await transport.send(createTestMessage({
        content: { text: "x".repeat(2000) },
      }));
      const accepted = await transport.send(createTestMessage({
        content: { text: "small message" },
      }));

      assert.ok(!oversized.successful);
      assert.ok(accepted.successful);
      assert.equal(server.getConnectionCount(), 1);
      assert.equal(server.getReceivedMessages().length, 1);
    } finally {
      await teardownTest(server, transport);
    }
  });

  test("should pool connections by default", async () => {
    const { server, transport } = await setupTest({ pool: undefined });
    try {
      const firstReceipt = await transport.send(createTestMessage());
      const secondReceipt = await transport.send(createTestMessage());

      assert.ok(firstReceipt.successful);
      assert.ok(secondReceipt.successful);
      assert.equal(server.getConnectionCount(), 1);
      assert.equal(server.getReceivedMessages().length, 2);
    } finally {
      await teardownTest(server, transport);
    }
  });

  test("should require STARTTLS even when it is not advertised", async () => {
    const { server, transport } = await setupTest({ requireTls: true });
    server.setResponse("STARTTLS", {
      code: 454,
      message: "TLS not available",
    });
    try {
      const receipt = await transport.send(createTestMessage());

      assert.ok(!receipt.successful);
      assert.match(receipt.errorMessages.join(" "), /STARTTLS failed/);
      assert.equal(server.getReceivedMessages().length, 0);
    } finally {
      await teardownTest(server, transport);
    }
  });

  test("should keep STARTTLS opportunistic when it is not required", async () => {
    const { server, transport } = await setupTest({ requireTls: false });
    server.setResponse("STARTTLS", {
      code: 454,
      message: "TLS not available",
    });
    try {
      const receipt = await transport.send(createTestMessage());

      assert.ok(receipt.successful);
      assert.equal(server.getReceivedMessages().length, 1);
    } finally {
      await teardownTest(server, transport);
    }
  });

  test("should report rejected recipients after partial delivery", async () => {
    const { server, transport } = await setupTest();
    try {
      server.setResponses("RCPT", [
        { code: 250, message: "OK" },
        { code: 550, message: "No such user here" },
      ]);

      const receipt = await transport.send(createTestMessage({
        recipients: [
          { address: "accepted@example.com" },
          { address: "rejected@example.com" },
        ],
      }));

      assert.ok(receipt.successful, JSON.stringify(receipt));
      if (receipt.successful) {
        assert.deepStrictEqual(receipt.rejectedRecipients, [
          {
            recipient: "rejected@example.com",
            code: 550,
            response: "No such user here",
            retryable: false,
          },
        ]);
      }
      assert.deepStrictEqual(server.getReceivedMessages()[0]?.to, [
        "accepted@example.com",
      ]);
    } finally {
      await teardownTest(server, transport);
    }
  });

  test("should mark transient partial rejections as retryable", async () => {
    const { server, transport } = await setupTest();
    try {
      server.setResponses("RCPT", [
        { code: 250, message: "OK" },
        { code: 451, message: "Try again later" },
      ]);

      const receipt = await transport.send(createTestMessage({
        recipients: [
          { address: "accepted@example.com" },
          { address: "deferred@example.com" },
        ],
      }));

      assert.ok(receipt.successful, JSON.stringify(receipt));
      if (receipt.successful) {
        assert.deepStrictEqual(receipt.rejectedRecipients, [
          {
            recipient: "deferred@example.com",
            code: 451,
            response: "Try again later",
            retryable: true,
          },
        ]);
      }
    } finally {
      await teardownTest(server, transport);
    }
  });

  test("should retry interrupted recipient pipelines", async () => {
    const { server, transport } = await setupTest();
    try {
      server.setCapabilities(["PIPELINING"]);
      server.setResponses("RCPT", [
        { code: 250, message: "OK" },
        {
          code: 550,
          message: "No such user here",
          closeConnection: true,
        },
        { code: 250, message: "OK" },
      ]);

      const receipt = await transport.send(createTestMessage({
        recipients: [
          { address: "accepted@example.com" },
          { address: "rejected@example.com" },
          { address: "unanswered@example.com" },
        ],
      }));

      assert.ok(!receipt.successful);
      if (!receipt.successful) {
        assert.equal(receipt.retryable, true);
        assert.equal(receipt.errors?.[0]?.category, "network");
        assert.equal(receipt.errors?.[0]?.code, "network");
        assert.match(receipt.errorMessages[0], /550 No such user here/);
      }
      assert.ok(
        !server.getReceivedCommands().some((command) => command === "DATA"),
      );
    } finally {
      await teardownTest(server, transport);
    }
  });

  test("should preserve retryability when every recipient is rejected", async () => {
    const { server, transport } = await setupTest();
    try {
      server.setResponses("RCPT", [
        { code: 550, message: "No such user here" },
        { code: 451, message: "Try again later" },
      ]);

      const receipt = await transport.send(createTestMessage({
        recipients: [
          { address: "invalid@example.com" },
          { address: "deferred@example.com" },
        ],
      }));

      assert.ok(!receipt.successful);
      if (!receipt.successful) {
        assert.strictEqual(receipt.retryable, true);
        assert.ok(receipt.errorMessages[0].includes("550 No such user here"));
        assert.ok(receipt.errorMessages[0].includes("451 Try again later"));
      }
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

  test("should continue sendMany after partial delivery", async () => {
    const { server, transport } = await setupTest();
    try {
      server.setResponses("RCPT", [
        { code: 250, message: "OK" },
        { code: 550, message: "No such user here" },
      ]);

      const messages = [
        createTestMessage({
          recipients: [
            { address: "accepted@example.com" },
            { address: "rejected@example.com" },
          ],
        }),
        createTestMessage({
          recipients: [{ address: "next@example.com" }],
        }),
      ];
      const receipts: SmtpReceipt[] = [];

      for await (const receipt of transport.sendMany(messages)) {
        receipts.push(receipt);
      }

      assert.strictEqual(receipts.length, 2);
      assert.ok(receipts[0].successful);
      if (receipts[0].successful) {
        assert.strictEqual(receipts[0].rejectedRecipients.length, 1);
      }
      assert.ok(receipts[1].successful);
      assert.deepStrictEqual(
        server.getReceivedMessages().map((message) => message.to),
        [["accepted@example.com"], ["next@example.com"]],
      );
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
      if (!receipt.successful) {
        assert.ok(receipt.errorMessages.length > 0);
        assert.ok(receipt.errorMessages[0].includes("MAIL FROM failed"));
      }
    } finally {
      await teardownTest(server, transport);
    }
  });

  test("should mark transient recipient failures as retryable", async () => {
    const { server, transport } = await setupTest();
    try {
      server.setResponse("RCPT", {
        code: 451,
        message: "Requested action aborted: local error in processing",
      });

      const receipt = await transport.send(createTestMessage());

      assert.ok(!receipt.successful);
      if (!receipt.successful) {
        assert.equal(receipt.provider, "smtp");
        assert.equal(receipt.retryable, true);
        assert.equal(receipt.errors?.[0]?.code, "smtp.451");
        assert.equal(receipt.errors?.[0]?.category, "service-unavailable");
        assert.equal(receipt.errors?.[0]?.retryable, true);
      }
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

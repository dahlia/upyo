/**
 * End-to-end tests for JmapTransport with Stalwart Mail Server.
 *
 * These tests require a running Stalwart Mail Server instance with JMAP enabled.
 * Set the following environment variables:
 * - STALWART_SESSION_URL: The JMAP session URL (e.g., http://localhost:8080/.well-known/jmap)
 * - STALWART_BEARER_TOKEN: A valid bearer token for authentication
 *
 * To run these tests:
 * 1. Start Stalwart: docker-compose up -d
 * 2. Configure a test account in Stalwart
 * 3. Set the environment variables
 * 4. Run: deno test src/jmap-transport.e2e.test.ts
 *
 * @module
 */

import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { JmapTransport } from "./jmap-transport.ts";
import {
  createTestMessage,
  getTestConfig,
  isStalwartTestingEnabled,
} from "./test-utils/test-config.ts";

describe(
  "JmapTransport E2E Tests",
  { skip: !isStalwartTestingEnabled(), concurrency: 1 },
  () => {
    if (!isStalwartTestingEnabled()) return;

    it("should send a basic text email", async () => {
      const config = getTestConfig();
      const transport = new JmapTransport(config.jmap);

      const message = createTestMessage({
        subject: "E2E Test - Basic Text",
        content: { text: "This is a test email sent via JMAP E2E test." },
      });

      const receipt = await transport.send(message);

      assert.ok(receipt.successful);
      if (receipt.successful) {
        assert.ok(receipt.messageId.length > 0);
      }
    });

    it("should preserve the identity and threading fields", async () => {
      const config = getTestConfig();
      const transport = new JmapTransport(config.jmap);

      const subject = `E2E Test - Identity ${Date.now()}`;
      const messageId = `ticket-${Date.now()}@mail.example.com`;
      const receipt = await transport.send(createTestMessage({
        subject,
        content: { text: "Correlating a reply back to a conversation." },
        messageId,
        date: new Date("2026-09-01T10:00:00Z"),
        inReplyTo: ["122@mail.example.com"],
        references: ["120@mail.example.com", "121@mail.example.com"],
      }));
      assert.ok(receipt.successful);

      // Read the stored Email back, so what is asserted is what the server
      // kept rather than what the client sent.
      const stored = await fetchStoredEmail(config, subject);

      assert.deepEqual(stored.messageId, [messageId]);
      assert.equal(stored.sentAt, "2026-09-01T10:00:00Z");
      assert.deepEqual(stored.inReplyTo, ["122@mail.example.com"]);
      assert.deepEqual(stored.references, [
        "120@mail.example.com",
        "121@mail.example.com",
      ]);
    });

    it("should send an HTML email", async () => {
      const config = getTestConfig();
      const transport = new JmapTransport(config.jmap);

      const message = createTestMessage({
        subject: "E2E Test - HTML Content",
        content: {
          html:
            "<h1>Test Email</h1><p>This is an <strong>HTML</strong> email.</p>",
        },
      });

      const receipt = await transport.send(message);

      if (!receipt.successful) {
        console.error("HTML email test failed:", receipt.errorMessages);
      }
      assert.ok(receipt.successful);
    });

    it("should send an email with both text and HTML", async () => {
      const config = getTestConfig();
      const transport = new JmapTransport(config.jmap);

      const message = createTestMessage({
        subject: "E2E Test - Text and HTML",
        content: {
          text: "Plain text version",
          html: "<p>HTML version</p>",
        },
      });

      const receipt = await transport.send(message);

      assert.ok(receipt.successful);
    });

    it("should send an email with attachment", async () => {
      const config = getTestConfig();
      const transport = new JmapTransport(config.jmap);

      const textContent = "Hello from attachment!";
      const textBytes = new TextEncoder().encode(textContent);

      const message = createTestMessage({
        subject: "E2E Test - Attachment",
        content: { text: "This email has an attachment." },
        attachments: [
          {
            filename: "test.txt",
            contentType: "text/plain" as const,
            content: textBytes,
            contentId: "test-attachment",
            inline: false,
          },
        ],
      });

      const receipt = await transport.send(message);

      if (!receipt.successful) {
        console.error("Attachment test failed:", receipt.errorMessages);
      }
      assert.ok(receipt.successful);
    });

    it("should send an email with inline image", async () => {
      const config = getTestConfig();
      const transport = new JmapTransport(config.jmap);

      // 1x1 transparent PNG
      const pngBytes = new Uint8Array([
        0x89,
        0x50,
        0x4e,
        0x47,
        0x0d,
        0x0a,
        0x1a,
        0x0a,
        0x00,
        0x00,
        0x00,
        0x0d,
        0x49,
        0x48,
        0x44,
        0x52,
        0x00,
        0x00,
        0x00,
        0x01,
        0x00,
        0x00,
        0x00,
        0x01,
        0x08,
        0x06,
        0x00,
        0x00,
        0x00,
        0x1f,
        0x15,
        0xc4,
        0x89,
        0x00,
        0x00,
        0x00,
        0x0a,
        0x49,
        0x44,
        0x41,
        0x54,
        0x78,
        0x9c,
        0x63,
        0x00,
        0x01,
        0x00,
        0x00,
        0x05,
        0x00,
        0x01,
        0x0d,
        0x0a,
        0x2d,
        0xb4,
        0x00,
        0x00,
        0x00,
        0x00,
        0x49,
        0x45,
        0x4e,
        0x44,
        0xae,
        0x42,
        0x60,
        0x82,
      ]);

      const message = createTestMessage({
        subject: "E2E Test - Inline Image",
        content: {
          html:
            '<p>This email has an inline image:</p><img src="cid:inline-image">',
        },
        attachments: [
          {
            filename: "image.png",
            contentType: "image/png" as const,
            content: pngBytes,
            contentId: "inline-image",
            inline: true,
          },
        ],
      });

      const receipt = await transport.send(message);

      if (!receipt.successful) {
        console.error("Inline image test failed:", receipt.errorMessages);
      }
      assert.ok(receipt.successful);
    });

    it("should handle Korean characters in subject and body", async () => {
      const config = getTestConfig();
      const transport = new JmapTransport(config.jmap);

      const message = createTestMessage({
        subject: "E2E Test - 한글 테스트 🌍",
        content: {
          text: "안녕하세요! 이것은 한국어 테스트입니다. 🚀",
          html: "<p>안녕하세요! 이것은 한국어 테스트입니다. 🚀</p>",
        },
      });

      const receipt = await transport.send(message);

      assert.ok(receipt.successful);
    });

    it("should send multiple emails with sendMany in a single batch", async () => {
      const config = getTestConfig();
      const transport = new JmapTransport(config.jmap);

      const messages = [
        createTestMessage({
          subject: "E2E Test - Batch 1",
          content: { text: "First email in batch" },
        }),
        createTestMessage({
          subject: "E2E Test - Batch 2",
          content: { text: "Second email in batch" },
        }),
        createTestMessage({
          subject: "E2E Test - Batch 3",
          content: { text: "Third email in batch" },
        }),
      ];

      const receipts = [];
      for await (const receipt of transport.sendMany(messages)) {
        if (!receipt.successful) {
          console.error("sendMany test failed:", receipt.errorMessages);
        }
        receipts.push(receipt);
      }

      assert.equal(receipts.length, 3);
      assert.ok(receipts.every((r) => r.successful));

      // Verify each message has a unique submission ID
      if (receipts.every((r) => r.successful)) {
        const messageIds = receipts.map((r) =>
          r.successful ? r.messageId : null
        );
        const uniqueIds = new Set(messageIds);
        assert.equal(
          uniqueIds.size,
          3,
          "Each message should have a unique submission ID",
        );
      }
    });

    it("should batch emails with attachments via sendMany", async () => {
      const config = getTestConfig();
      const transport = new JmapTransport(config.jmap);

      const textBytes = new TextEncoder().encode("Attachment content");

      const messages = [
        createTestMessage({
          subject: "E2E Test - Batch with Attachment 1",
          content: { text: "First email with attachment" },
          attachments: [
            {
              filename: "file1.txt",
              contentType: "text/plain" as const,
              content: textBytes,
              contentId: "attachment-1",
              inline: false,
            },
          ],
        }),
        createTestMessage({
          subject: "E2E Test - Batch with Attachment 2",
          content: { text: "Second email with attachment" },
          attachments: [
            {
              filename: "file2.txt",
              contentType: "text/plain" as const,
              content: textBytes,
              contentId: "attachment-2",
              inline: false,
            },
          ],
        }),
      ];

      const receipts = [];
      for await (const receipt of transport.sendMany(messages)) {
        if (!receipt.successful) {
          console.error(
            "sendMany with attachments failed:",
            receipt.errorMessages,
          );
        }
        receipts.push(receipt);
      }

      assert.equal(receipts.length, 2);
      assert.ok(receipts.every((r) => r.successful));
    });

    it("should respect abort signal", async () => {
      const config = getTestConfig();
      const transport = new JmapTransport(config.jmap);

      const controller = new AbortController();
      controller.abort();

      const message = createTestMessage({
        subject: "E2E Test - Should be aborted",
        content: { text: "This should not be sent" },
      });

      await assert.rejects(
        () => transport.send(message, { signal: controller.signal }),
        (error: unknown) =>
          error instanceof Error && error.name === "AbortError",
      );
    });

    interface StoredEmail {
      readonly messageId?: readonly string[];
      readonly inReplyTo?: readonly string[];
      readonly references?: readonly string[];
      readonly sentAt?: string;
    }

    /**
     * Reads back the stored Email with a given subject through raw JMAP, so
     * that an assertion sees the server's own representation.
     */
    async function fetchStoredEmail(
      config: ReturnType<typeof getTestConfig>,
      subject: string,
    ): Promise<StoredEmail> {
      const { sessionUrl, basicAuth, bearerToken, baseUrl } = config.jmap as {
        sessionUrl: string;
        basicAuth?: { username: string; password: string };
        bearerToken?: string;
        baseUrl?: string;
      };
      const authorization = bearerToken == null
        ? `Basic ${btoa(`${basicAuth!.username}:${basicAuth!.password}`)}`
        : `Bearer ${bearerToken}`;
      const headers = {
        authorization,
        "content-type": "application/json",
      };

      const session = await (await fetch(sessionUrl, { headers })).json();
      const accountId = session.primaryAccounts["urn:ietf:params:jmap:mail"];
      // The session advertises the server's own hostname, which is not what
      // reaches it from outside its container.
      const apiUrl = baseUrl == null
        ? session.apiUrl
        : new URL(new URL(session.apiUrl).pathname, baseUrl).href;
      const response = await (await fetch(apiUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          using: ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
          methodCalls: [
            [
              "Email/query",
              { accountId, filter: { subject } },
              "query",
            ],
            [
              "Email/get",
              {
                accountId,
                "#ids": {
                  resultOf: "query",
                  name: "Email/query",
                  path: "/ids",
                },
                properties: [
                  "messageId",
                  "inReplyTo",
                  "references",
                  "sentAt",
                ],
              },
              "get",
            ],
          ],
        }),
      })).json();

      const emails = response.methodResponses
        .find((call: [string, unknown, string]) => call[2] === "get")?.[1]
        ?.list as readonly StoredEmail[] | undefined;
      assert.ok(
        emails != null && emails.length > 0,
        `no stored Email found for subject ${JSON.stringify(subject)}`,
      );
      return emails[0];
    }
  },
);

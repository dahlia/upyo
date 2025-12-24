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

    it("should send multiple emails with sendMany", async () => {
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
      ];

      const receipts = [];
      for await (const receipt of transport.sendMany(messages)) {
        if (!receipt.successful) {
          console.error("sendMany test failed:", receipt.errorMessages);
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

      const receipt = await transport.send(message, {
        signal: controller.signal,
      });

      assert.ok(!receipt.successful);
      if (!receipt.successful) {
        assert.ok(
          receipt.errorMessages.some(
            (msg) =>
              msg.includes("abort") ||
              msg.includes("Abort") ||
              msg.includes("cancel"),
          ),
        );
      }
    });
  },
);

import type { Message } from "@upyo/core";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { DkimConfig } from "./dkim/index.ts";
import { convertMessage } from "./message-converter.ts";
import {
  TEST_DKIM_DOMAIN,
  TEST_DKIM_PRIVATE_KEY,
  TEST_DKIM_SELECTOR,
} from "./test-utils/dkim-test-keys.ts";

describe("DKIM Integration Tests", () => {
  const createTestMessage = (overrides: Partial<Message> = {}): Message => ({
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
  });

  const testDkimConfig: DkimConfig = {
    signatures: [
      {
        signingDomain: TEST_DKIM_DOMAIN,
        selector: TEST_DKIM_SELECTOR,
        privateKey: TEST_DKIM_PRIVATE_KEY,
      },
    ],
  };

  describe("Message Conversion with DKIM", () => {
    test("should add DKIM-Signature header when DKIM is configured", async () => {
      const message = createTestMessage();
      const result = await convertMessage(message, testDkimConfig);

      // Should have DKIM-Signature header
      assert.ok(
        result.raw.startsWith("DKIM-Signature:"),
        "Message should start with DKIM-Signature header",
      );

      // Should contain required DKIM tags
      assert.ok(result.raw.includes("v=1"), "Should include version tag");
      assert.ok(
        result.raw.includes("a=rsa-sha256"),
        "Should include algorithm tag",
      );
      assert.ok(
        result.raw.includes(`d=${TEST_DKIM_DOMAIN}`),
        "Should include signing domain tag",
      );
      assert.ok(
        result.raw.includes(`s=${TEST_DKIM_SELECTOR}`),
        "Should include selector tag",
      );
      assert.ok(result.raw.includes("bh="), "Should include body hash tag");
      assert.ok(result.raw.includes("b="), "Should include signature tag");
    });

    test("should include standard headers in signed header list", async () => {
      const message = createTestMessage();
      const result = await convertMessage(message, testDkimConfig);

      // Check h= tag includes standard headers
      const hMatch = result.raw.match(/h=([^;]+)/);
      assert.ok(hMatch, "Should have h= tag");

      const signedHeaders = hMatch[1].toLowerCase();
      assert.ok(signedHeaders.includes("from"), "Should sign From header");
      assert.ok(signedHeaders.includes("to"), "Should sign To header");
      assert.ok(
        signedHeaders.includes("subject"),
        "Should sign Subject header",
      );
      assert.ok(signedHeaders.includes("date"), "Should sign Date header");
    });

    test("should sign message with custom canonicalization", async () => {
      const message = createTestMessage();
      const config: DkimConfig = {
        signatures: [
          {
            signingDomain: TEST_DKIM_DOMAIN,
            selector: TEST_DKIM_SELECTOR,
            privateKey: TEST_DKIM_PRIVATE_KEY,
            canonicalization: "simple/simple",
          },
        ],
      };

      const result = await convertMessage(message, config);

      assert.ok(
        result.raw.includes("c=simple/simple"),
        "Should use specified canonicalization",
      );
    });

    test("should sign message with custom header fields", async () => {
      const message = createTestMessage();
      const config: DkimConfig = {
        signatures: [
          {
            signingDomain: TEST_DKIM_DOMAIN,
            selector: TEST_DKIM_SELECTOR,
            privateKey: TEST_DKIM_PRIVATE_KEY,
            headerFields: ["from", "to", "subject"],
          },
        ],
      };

      const result = await convertMessage(message, config);

      const hMatch = result.raw.match(/h=([^;]+)/);
      assert.ok(hMatch);
      assert.strictEqual(
        hMatch[1].toLowerCase(),
        "from:to:subject",
        "Should only include specified headers",
      );
    });

    test("should preserve original message content after signing", async () => {
      const message = createTestMessage({
        subject: "Original Subject",
        content: { text: "Original content here" },
      });

      const result = await convertMessage(message, testDkimConfig);

      // Original message content should be preserved after DKIM-Signature header
      assert.ok(
        result.raw.includes("Subject: Original Subject"),
        "Subject should be preserved",
      );
      assert.ok(
        result.raw.includes("Original content here"),
        "Content should be preserved",
      );
    });

    test("should handle multiple DKIM signatures", async () => {
      const message = createTestMessage();
      const config: DkimConfig = {
        signatures: [
          {
            signingDomain: "domain1.example.com",
            selector: "selector1",
            privateKey: TEST_DKIM_PRIVATE_KEY,
          },
          {
            signingDomain: "domain2.example.com",
            selector: "selector2",
            privateKey: TEST_DKIM_PRIVATE_KEY,
          },
        ],
      };

      const result = await convertMessage(message, config);

      // Should have multiple DKIM-Signature headers
      const dkimMatches = result.raw.match(/DKIM-Signature:/g);
      assert.ok(dkimMatches);
      assert.strictEqual(
        dkimMatches.length,
        2,
        "Should have two DKIM-Signature headers",
      );

      // Check both domains are present
      assert.ok(
        result.raw.includes("d=domain1.example.com"),
        "Should include first domain",
      );
      assert.ok(
        result.raw.includes("d=domain2.example.com"),
        "Should include second domain",
      );
    });
  });

  describe("DKIM Signing Failure Handling", () => {
    test("should throw error by default on signing failure", async () => {
      const message = createTestMessage();
      const config: DkimConfig = {
        signatures: [
          {
            signingDomain: TEST_DKIM_DOMAIN,
            selector: TEST_DKIM_SELECTOR,
            privateKey: "invalid-private-key",
          },
        ],
      };

      await assert.rejects(
        async () => await convertMessage(message, config),
        /Failed to import private key/,
        "Should throw error on invalid private key",
      );
    });

    test("should throw error when onSigningFailure is 'throw'", async () => {
      const message = createTestMessage();
      const config: DkimConfig = {
        signatures: [
          {
            signingDomain: TEST_DKIM_DOMAIN,
            selector: TEST_DKIM_SELECTOR,
            privateKey: "invalid-private-key",
          },
        ],
        onSigningFailure: "throw",
      };

      await assert.rejects(
        async () => await convertMessage(message, config),
        /Failed to import private key/,
        "Should throw error when onSigningFailure is 'throw'",
      );
    });

    test("should send unsigned when onSigningFailure is 'send-unsigned'", async () => {
      const message = createTestMessage();
      const config: DkimConfig = {
        signatures: [
          {
            signingDomain: TEST_DKIM_DOMAIN,
            selector: TEST_DKIM_SELECTOR,
            privateKey: "invalid-private-key",
          },
        ],
        onSigningFailure: "send-unsigned",
      };

      // Should not throw
      const result = await convertMessage(message, config);

      // Should NOT have DKIM-Signature header (sent unsigned)
      assert.ok(
        !result.raw.includes("DKIM-Signature:"),
        "Should not have DKIM-Signature when sending unsigned",
      );

      // Original message content should still be present
      assert.ok(
        result.raw.includes("From: John Doe <john@example.com>"),
        "From header should be present",
      );
      assert.ok(result.raw.includes("Subject: Test Subject"));
    });
  });

  describe("DKIM with Various Message Types", () => {
    test("should sign HTML email", async () => {
      const message = createTestMessage({
        content: { html: "<h1>Hello</h1><p>World!</p>" },
      });

      const result = await convertMessage(message, testDkimConfig);

      assert.ok(result.raw.includes("DKIM-Signature:"));
      assert.ok(result.raw.includes("Content-Type: text/html"));
      assert.ok(result.raw.includes("<h1>Hello</h1><p>World!</p>"));
    });

    test("should sign multipart email with HTML and text", async () => {
      const message = createTestMessage({
        content: {
          text: "Plain text version",
          html: "<p>HTML version</p>",
        },
      });

      const result = await convertMessage(message, testDkimConfig);

      assert.ok(result.raw.includes("DKIM-Signature:"));
      assert.ok(result.raw.includes("Content-Type: multipart/alternative"));
      assert.ok(result.raw.includes("Plain text version"));
      assert.ok(result.raw.includes("<p>HTML version</p>"));
    });

    test("should sign email with attachments", async () => {
      const attachmentContent = new TextEncoder().encode("Attachment content");
      const message = createTestMessage({
        attachments: [
          {
            filename: "test.txt",
            content: attachmentContent,
            contentType: "text/plain",
            contentId: "test-file",
            inline: false,
          },
        ],
      });

      const result = await convertMessage(message, testDkimConfig);

      assert.ok(result.raw.includes("DKIM-Signature:"));
      assert.ok(result.raw.includes("Content-Type: multipart/mixed"));
      assert.ok(result.raw.includes('name="test.txt"'));
    });

    test("should sign email with non-ASCII content", async () => {
      const message = createTestMessage({
        sender: { name: "김철수", address: "kim@example.com" },
        subject: "한글 제목입니다",
        content: { text: "안녕하세요! 이것은 한국어 테스트입니다." },
      });

      const result = await convertMessage(message, testDkimConfig);

      assert.ok(result.raw.includes("DKIM-Signature:"));
      assert.ok(result.raw.includes("=?UTF-8?B?")); // Encoded subject
    });

    test("should sign high priority email", async () => {
      const message = createTestMessage({
        priority: "high",
      });

      const result = await convertMessage(message, testDkimConfig);

      assert.ok(result.raw.includes("DKIM-Signature:"));
      assert.ok(result.raw.includes("X-Priority: 1"));
      assert.ok(result.raw.includes("X-MSMail-Priority: High"));
    });

    test("should sign email with custom headers", async () => {
      const headers = new Headers();
      headers.set("X-Custom-Header", "Custom Value");
      headers.set("X-Mailer", "Upyo Test");

      const message = createTestMessage({ headers });
      const result = await convertMessage(message, testDkimConfig);

      assert.ok(result.raw.includes("DKIM-Signature:"));
      assert.ok(result.raw.includes("x-custom-header: Custom Value"));
      assert.ok(result.raw.includes("x-mailer: Upyo Test"));
    });

    test("should sign email with multiple recipients", async () => {
      const message = createTestMessage({
        recipients: [
          { address: "recipient1@example.com" },
          { address: "recipient2@example.com" },
        ],
        ccRecipients: [{ address: "cc@example.com" }],
        bccRecipients: [{ address: "bcc@example.com" }],
      });

      const result = await convertMessage(message, testDkimConfig);

      assert.ok(result.raw.includes("DKIM-Signature:"));
      assert.deepStrictEqual(result.envelope.to, [
        "recipient1@example.com",
        "recipient2@example.com",
        "cc@example.com",
        "bcc@example.com",
      ]);
    });
  });

  describe("DKIM Signature Verification Structure", () => {
    test("should produce valid DKIM-Signature header format", async () => {
      const message = createTestMessage();
      const result = await convertMessage(message, testDkimConfig);

      // Extract DKIM-Signature header
      const lines = result.raw.split("\r\n");
      const dkimLine = lines[0];

      assert.ok(
        dkimLine.startsWith("DKIM-Signature: v=1;"),
        "Should start with version",
      );

      // Check all required tags are present
      const requiredTags = ["v=", "a=", "c=", "d=", "s=", "h=", "bh=", "b="];
      for (const tag of requiredTags) {
        assert.ok(
          result.raw.includes(tag),
          `Should contain ${tag} tag`,
        );
      }
    });

    test("should generate valid Base64 body hash", async () => {
      const message = createTestMessage();
      const result = await convertMessage(message, testDkimConfig);

      // Extract bh= value
      const bhMatch = result.raw.match(/bh=([A-Za-z0-9+/]+=*)/);
      assert.ok(bhMatch, "Should have bh= tag with Base64 value");

      // Should be valid Base64 (SHA-256 produces 32 bytes = 44 Base64 chars with padding)
      const bhValue = bhMatch[1];
      assert.ok(
        /^[A-Za-z0-9+/]+=*$/.test(bhValue),
        "Body hash should be valid Base64",
      );
    });

    test("should generate valid Base64 signature", async () => {
      const message = createTestMessage();
      const result = await convertMessage(message, testDkimConfig);

      // Extract b= value (signature)
      const bMatch = result.raw.match(/b=([A-Za-z0-9+/]+=*)/);
      assert.ok(bMatch, "Should have b= tag with Base64 value");

      // Should be valid Base64 (RSA-2048 produces 256 bytes = 344 Base64 chars)
      const bValue = bMatch[1];
      assert.ok(
        /^[A-Za-z0-9+/]+=*$/.test(bValue),
        "Signature should be valid Base64",
      );
    });
  });

  describe("Message without DKIM", () => {
    test("should not add DKIM-Signature when no config is provided", async () => {
      const message = createTestMessage();
      const result = await convertMessage(message);

      assert.ok(
        !result.raw.includes("DKIM-Signature:"),
        "Should not have DKIM-Signature without config",
      );
    });

    test("should not add DKIM-Signature when config has empty signatures", async () => {
      const message = createTestMessage();
      const config: DkimConfig = {
        signatures: [],
      };

      const result = await convertMessage(message, config);

      assert.ok(
        !result.raw.includes("DKIM-Signature:"),
        "Should not have DKIM-Signature with empty signatures",
      );
    });
  });
});

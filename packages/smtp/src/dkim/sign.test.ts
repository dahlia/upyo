import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  TEST_DKIM_DOMAIN,
  TEST_DKIM_ED25519_PRIVATE_KEY,
  TEST_DKIM_ED25519_SELECTOR,
  TEST_DKIM_PRIVATE_KEY,
  TEST_DKIM_SELECTOR,
} from "../test-utils/dkim-test-keys.ts";
import { signMessage } from "./sign.ts";

describe("DKIM Signing", () => {
  const simpleMessage = "From: sender@example.com\r\n" +
    "To: recipient@example.com\r\n" +
    "Subject: Test Email\r\n" +
    "Date: Thu, 01 Jan 2025 00:00:00 +0000\r\n" +
    "MIME-Version: 1.0\r\n" +
    "Content-Type: text/plain; charset=utf-8\r\n" +
    "\r\n" +
    "Hello, World!\r\n";

  describe("signMessage", () => {
    it("should generate a valid DKIM-Signature header", async () => {
      const result = await signMessage(simpleMessage, {
        signingDomain: TEST_DKIM_DOMAIN,
        selector: TEST_DKIM_SELECTOR,
        privateKey: TEST_DKIM_PRIVATE_KEY,
      });

      assert.strictEqual(result.headerName, "DKIM-Signature");
      assert.ok(result.signature.includes("v=1"));
      assert.ok(result.signature.includes("a=rsa-sha256"));
      assert.ok(result.signature.includes(`d=${TEST_DKIM_DOMAIN}`));
      assert.ok(result.signature.includes(`s=${TEST_DKIM_SELECTOR}`));
      assert.ok(result.signature.includes("bh="));
      assert.ok(result.signature.includes("b="));
      assert.ok(result.signature.includes("h="));
    });

    it("should include specified header fields in h= tag", async () => {
      const result = await signMessage(simpleMessage, {
        signingDomain: TEST_DKIM_DOMAIN,
        selector: TEST_DKIM_SELECTOR,
        privateKey: TEST_DKIM_PRIVATE_KEY,
        headerFields: ["from", "to", "subject"],
      });

      assert.ok(result.signature.includes("h=from:to:subject"));
    });

    it("should use default header fields if not specified", async () => {
      const result = await signMessage(simpleMessage, {
        signingDomain: TEST_DKIM_DOMAIN,
        selector: TEST_DKIM_SELECTOR,
        privateKey: TEST_DKIM_PRIVATE_KEY,
      });

      // Default headers: from, to, subject, date
      assert.ok(result.signature.includes("h=from:to:subject:date"));
    });

    it("should use specified canonicalization method", async () => {
      const result = await signMessage(simpleMessage, {
        signingDomain: TEST_DKIM_DOMAIN,
        selector: TEST_DKIM_SELECTOR,
        privateKey: TEST_DKIM_PRIVATE_KEY,
        canonicalization: "simple/simple",
      });

      assert.ok(result.signature.includes("c=simple/simple"));
    });

    it("should default to relaxed/relaxed canonicalization", async () => {
      const result = await signMessage(simpleMessage, {
        signingDomain: TEST_DKIM_DOMAIN,
        selector: TEST_DKIM_SELECTOR,
        privateKey: TEST_DKIM_PRIVATE_KEY,
      });

      assert.ok(result.signature.includes("c=relaxed/relaxed"));
    });

    it("should generate different signatures for different messages", async () => {
      const message1 = "From: sender@example.com\r\n" +
        "To: recipient@example.com\r\n" +
        "Subject: Test 1\r\n" +
        "Date: Thu, 01 Jan 2025 00:00:00 +0000\r\n" +
        "\r\n" +
        "Body 1\r\n";

      const message2 = "From: sender@example.com\r\n" +
        "To: recipient@example.com\r\n" +
        "Subject: Test 2\r\n" +
        "Date: Thu, 01 Jan 2025 00:00:00 +0000\r\n" +
        "\r\n" +
        "Body 2\r\n";

      const result1 = await signMessage(message1, {
        signingDomain: TEST_DKIM_DOMAIN,
        selector: TEST_DKIM_SELECTOR,
        privateKey: TEST_DKIM_PRIVATE_KEY,
      });

      const result2 = await signMessage(message2, {
        signingDomain: TEST_DKIM_DOMAIN,
        selector: TEST_DKIM_SELECTOR,
        privateKey: TEST_DKIM_PRIVATE_KEY,
      });

      // Both body hash and signature should be different
      const bh1 = result1.signature.match(/bh=([^;]+)/)?.[1];
      const bh2 = result2.signature.match(/bh=([^;]+)/)?.[1];
      const b1 = result1.signature.match(/b=([^;]+)/)?.[1];
      const b2 = result2.signature.match(/b=([^;]+)/)?.[1];

      assert.notStrictEqual(bh1, bh2, "Body hashes should differ");
      assert.notStrictEqual(b1, b2, "Signatures should differ");
    });

    it("should handle messages with empty body", async () => {
      const emptyBodyMessage = "From: sender@example.com\r\n" +
        "To: recipient@example.com\r\n" +
        "Subject: Empty Body Test\r\n" +
        "Date: Thu, 01 Jan 2025 00:00:00 +0000\r\n" +
        "\r\n";

      const result = await signMessage(emptyBodyMessage, {
        signingDomain: TEST_DKIM_DOMAIN,
        selector: TEST_DKIM_SELECTOR,
        privateKey: TEST_DKIM_PRIVATE_KEY,
      });

      assert.strictEqual(result.headerName, "DKIM-Signature");
      assert.ok(result.signature.includes("bh="));
    });

    it("should handle messages with multipart content", async () => {
      const multipartMessage = "From: sender@example.com\r\n" +
        "To: recipient@example.com\r\n" +
        "Subject: Multipart Test\r\n" +
        "Date: Thu, 01 Jan 2025 00:00:00 +0000\r\n" +
        "MIME-Version: 1.0\r\n" +
        "Content-Type: multipart/alternative; boundary=boundary123\r\n" +
        "\r\n" +
        "--boundary123\r\n" +
        "Content-Type: text/plain\r\n" +
        "\r\n" +
        "Plain text\r\n" +
        "--boundary123\r\n" +
        "Content-Type: text/html\r\n" +
        "\r\n" +
        "<p>HTML</p>\r\n" +
        "--boundary123--\r\n";

      const result = await signMessage(multipartMessage, {
        signingDomain: TEST_DKIM_DOMAIN,
        selector: TEST_DKIM_SELECTOR,
        privateKey: TEST_DKIM_PRIVATE_KEY,
      });

      assert.strictEqual(result.headerName, "DKIM-Signature");
      assert.ok(result.signature.includes("v=1"));
    });

    it("should handle non-ASCII characters in headers", async () => {
      const unicodeMessage =
        "From: =?UTF-8?B?7YWM7Iqk7Yq4?= <sender@example.com>\r\n" +
        "To: recipient@example.com\r\n" +
        "Subject: =?UTF-8?B?7ZWc6riA7Ja0IO2FjOyKpO2KuA==?=\r\n" +
        "Date: Thu, 01 Jan 2025 00:00:00 +0000\r\n" +
        "\r\n" +
        "Hello\r\n";

      const result = await signMessage(unicodeMessage, {
        signingDomain: TEST_DKIM_DOMAIN,
        selector: TEST_DKIM_SELECTOR,
        privateKey: TEST_DKIM_PRIVATE_KEY,
      });

      assert.strictEqual(result.headerName, "DKIM-Signature");
      assert.ok(result.signature.includes("v=1"));
    });

    it("should throw error for invalid private key", async () => {
      await assert.rejects(
        async () => {
          await signMessage(simpleMessage, {
            signingDomain: TEST_DKIM_DOMAIN,
            selector: TEST_DKIM_SELECTOR,
            privateKey: "invalid-key",
          });
        },
        /Failed to import private key|invalid/i,
      );
    });

    it("should sign with Ed25519 algorithm", async () => {
      const result = await signMessage(simpleMessage, {
        signingDomain: TEST_DKIM_DOMAIN,
        selector: TEST_DKIM_ED25519_SELECTOR,
        privateKey: TEST_DKIM_ED25519_PRIVATE_KEY,
        algorithm: "ed25519-sha256",
      });

      assert.strictEqual(result.headerName, "DKIM-Signature");
      assert.ok(result.signature.includes("v=1"));
      assert.ok(result.signature.includes("a=ed25519-sha256"));
      assert.ok(result.signature.includes(`d=${TEST_DKIM_DOMAIN}`));
      assert.ok(result.signature.includes(`s=${TEST_DKIM_ED25519_SELECTOR}`));
      assert.ok(result.signature.includes("bh="));
      assert.ok(result.signature.includes("b="));
    });

    it("should accept CryptoKey for RSA signing", async () => {
      // Import the private key first
      const pemContents = TEST_DKIM_PRIVATE_KEY
        .replace(/-----BEGIN (?:RSA )?PRIVATE KEY-----/, "")
        .replace(/-----END (?:RSA )?PRIVATE KEY-----/, "")
        .replace(/\s/g, "");
      const binaryString = atob(pemContents);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const cryptoKey = await crypto.subtle.importKey(
        "pkcs8",
        bytes,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["sign"],
      );

      const result = await signMessage(simpleMessage, {
        signingDomain: TEST_DKIM_DOMAIN,
        selector: TEST_DKIM_SELECTOR,
        privateKey: cryptoKey,
      });

      assert.strictEqual(result.headerName, "DKIM-Signature");
      assert.ok(result.signature.includes("v=1"));
      assert.ok(result.signature.includes("a=rsa-sha256"));
    });

    it("should accept CryptoKey for Ed25519 signing", async () => {
      // Import the Ed25519 private key first
      const pemContents = TEST_DKIM_ED25519_PRIVATE_KEY
        .replace(/-----BEGIN PRIVATE KEY-----/, "")
        .replace(/-----END PRIVATE KEY-----/, "")
        .replace(/\s/g, "");
      const binaryString = atob(pemContents);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const cryptoKey = await crypto.subtle.importKey(
        "pkcs8",
        bytes,
        { name: "Ed25519" },
        false,
        ["sign"],
      );

      const result = await signMessage(simpleMessage, {
        signingDomain: TEST_DKIM_DOMAIN,
        selector: TEST_DKIM_ED25519_SELECTOR,
        privateKey: cryptoKey,
        algorithm: "ed25519-sha256",
      });

      assert.strictEqual(result.headerName, "DKIM-Signature");
      assert.ok(result.signature.includes("v=1"));
      assert.ok(result.signature.includes("a=ed25519-sha256"));
    });

    it("should generate different signatures for Ed25519 vs RSA", async () => {
      const rsaResult = await signMessage(simpleMessage, {
        signingDomain: TEST_DKIM_DOMAIN,
        selector: TEST_DKIM_SELECTOR,
        privateKey: TEST_DKIM_PRIVATE_KEY,
        algorithm: "rsa-sha256",
      });

      const ed25519Result = await signMessage(simpleMessage, {
        signingDomain: TEST_DKIM_DOMAIN,
        selector: TEST_DKIM_ED25519_SELECTOR,
        privateKey: TEST_DKIM_ED25519_PRIVATE_KEY,
        algorithm: "ed25519-sha256",
      });

      // The signatures should be different (different algorithms)
      const rsaSig = rsaResult.signature.match(/b=([^;]+)/)?.[1];
      const ed25519Sig = ed25519Result.signature.match(/b=([^;]+)/)?.[1];

      assert.ok(rsaSig, "RSA signature should exist");
      assert.ok(ed25519Sig, "Ed25519 signature should exist");
      assert.notStrictEqual(rsaSig, ed25519Sig, "Signatures should differ");

      // Ed25519 signatures are shorter (64 bytes = ~88 base64 chars)
      // RSA-2048 signatures are 256 bytes = ~344 base64 chars
      assert.ok(
        ed25519Sig!.length < rsaSig!.length,
        "Ed25519 signature should be shorter than RSA",
      );
    });
  });
});

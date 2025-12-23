import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canonicalizeBodyRelaxed,
  canonicalizeBodySimple,
  canonicalizeHeaderRelaxed,
  canonicalizeHeaderSimple,
} from "./canonicalize.ts";

describe("DKIM Canonicalization", () => {
  describe("canonicalizeHeaderSimple", () => {
    it("should not modify header at all", () => {
      const result = canonicalizeHeaderSimple(
        "Subject",
        "Hello World",
      );
      assert.strictEqual(result, "Subject:Hello World");
    });

    it("should preserve original case", () => {
      const result = canonicalizeHeaderSimple(
        "Content-Type",
        "text/plain; charset=UTF-8",
      );
      assert.strictEqual(result, "Content-Type:text/plain; charset=UTF-8");
    });

    it("should preserve whitespace in value", () => {
      const result = canonicalizeHeaderSimple(
        "Subject",
        "  Hello   World  ",
      );
      assert.strictEqual(result, "Subject:  Hello   World  ");
    });

    it("should handle folded headers (multi-line)", () => {
      const result = canonicalizeHeaderSimple(
        "Subject",
        "Hello\r\n World",
      );
      assert.strictEqual(result, "Subject:Hello\r\n World");
    });
  });

  describe("canonicalizeHeaderRelaxed", () => {
    it("should lowercase header name", () => {
      const result = canonicalizeHeaderRelaxed(
        "Subject",
        "Hello World",
      );
      assert.strictEqual(result, "subject:Hello World");
    });

    it("should lowercase mixed case header name", () => {
      const result = canonicalizeHeaderRelaxed(
        "Content-Type",
        "text/plain",
      );
      assert.strictEqual(result, "content-type:text/plain");
    });

    it("should collapse whitespace in value to single space", () => {
      const result = canonicalizeHeaderRelaxed(
        "Subject",
        "Hello    World",
      );
      assert.strictEqual(result, "subject:Hello World");
    });

    it("should remove leading whitespace from value", () => {
      const result = canonicalizeHeaderRelaxed(
        "Subject",
        "   Hello World",
      );
      assert.strictEqual(result, "subject:Hello World");
    });

    it("should remove trailing whitespace from value", () => {
      const result = canonicalizeHeaderRelaxed(
        "Subject",
        "Hello World   ",
      );
      assert.strictEqual(result, "subject:Hello World");
    });

    it("should unfold multi-line headers", () => {
      const result = canonicalizeHeaderRelaxed(
        "Subject",
        "Hello\r\n World",
      );
      assert.strictEqual(result, "subject:Hello World");
    });

    it("should handle tabs as whitespace", () => {
      const result = canonicalizeHeaderRelaxed(
        "Subject",
        "Hello\t\tWorld",
      );
      assert.strictEqual(result, "subject:Hello World");
    });

    it("should handle mixed whitespace", () => {
      const result = canonicalizeHeaderRelaxed(
        "Subject",
        "  Hello \t\r\n  World  ",
      );
      assert.strictEqual(result, "subject:Hello World");
    });
  });

  describe("canonicalizeBodySimple", () => {
    it("should return CRLF for empty body", () => {
      const result = canonicalizeBodySimple("");
      assert.strictEqual(result, "\r\n");
    });

    it("should add CRLF if body doesn't end with CRLF", () => {
      const result = canonicalizeBodySimple("Hello World");
      assert.strictEqual(result, "Hello World\r\n");
    });

    it("should preserve single trailing CRLF", () => {
      const result = canonicalizeBodySimple("Hello World\r\n");
      assert.strictEqual(result, "Hello World\r\n");
    });

    it("should reduce multiple trailing CRLFs to single CRLF", () => {
      const result = canonicalizeBodySimple("Hello World\r\n\r\n\r\n");
      assert.strictEqual(result, "Hello World\r\n");
    });

    it("should preserve internal empty lines", () => {
      const result = canonicalizeBodySimple("Hello\r\n\r\nWorld\r\n");
      assert.strictEqual(result, "Hello\r\n\r\nWorld\r\n");
    });

    it("should preserve whitespace in lines", () => {
      const result = canonicalizeBodySimple("Hello   World\r\n");
      assert.strictEqual(result, "Hello   World\r\n");
    });
  });

  describe("canonicalizeBodyRelaxed", () => {
    it("should return empty string for empty body", () => {
      const result = canonicalizeBodyRelaxed("");
      assert.strictEqual(result, "");
    });

    it("should remove trailing whitespace from lines", () => {
      const result = canonicalizeBodyRelaxed("Hello World   \r\n");
      assert.strictEqual(result, "Hello World\r\n");
    });

    it("should collapse whitespace within lines to single space", () => {
      const result = canonicalizeBodyRelaxed("Hello    World\r\n");
      assert.strictEqual(result, "Hello World\r\n");
    });

    it("should remove trailing empty lines", () => {
      const result = canonicalizeBodyRelaxed("Hello World\r\n\r\n\r\n");
      assert.strictEqual(result, "Hello World\r\n");
    });

    it("should preserve internal empty lines", () => {
      const result = canonicalizeBodyRelaxed("Hello\r\n\r\nWorld\r\n");
      assert.strictEqual(result, "Hello\r\n\r\nWorld\r\n");
    });

    it("should handle tabs as whitespace", () => {
      const result = canonicalizeBodyRelaxed("Hello\t\tWorld\r\n");
      assert.strictEqual(result, "Hello World\r\n");
    });

    it("should handle lines with only whitespace", () => {
      const result = canonicalizeBodyRelaxed("Hello\r\n   \r\nWorld\r\n");
      assert.strictEqual(result, "Hello\r\n\r\nWorld\r\n");
    });

    it("should handle complex multi-line body", () => {
      const input = "Line 1   \r\n" +
        "Line   2\r\n" +
        "\r\n" +
        "Line 3\t\t\r\n" +
        "\r\n" +
        "\r\n";
      const expected = "Line 1\r\n" +
        "Line 2\r\n" +
        "\r\n" +
        "Line 3\r\n";
      const result = canonicalizeBodyRelaxed(input);
      assert.strictEqual(result, expected);
    });

    it("should handle body without trailing CRLF", () => {
      const result = canonicalizeBodyRelaxed("Hello World");
      assert.strictEqual(result, "Hello World\r\n");
    });
  });
});

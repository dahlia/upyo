import { type Attachment, isAttachment } from "@upyo/core/attachment";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("isAttachment", () => {
  it("should return true for valid attachment with Uint8Array content", () => {
    const attachment: Attachment = {
      inline: false,
      filename: "test.pdf",
      content: new Uint8Array([1, 2, 3]),
      contentType: "application/pdf",
      contentId: "test-id",
    };

    assert.ok(isAttachment(attachment));
  });

  it("should return true for valid attachment with Promise<Uint8Array> content", () => {
    const attachment: Attachment = {
      inline: true,
      filename: "image.png",
      content: Promise.resolve(new Uint8Array([1, 2, 3])),
      contentType: "image/png",
      contentId: "image-id",
    };

    assert.ok(isAttachment(attachment));
  });

  it("should return false for null", () => {
    assert.ok(!isAttachment(null));
  });

  it("should return false for undefined", () => {
    assert.ok(!isAttachment(undefined));
  });

  it("should return false for primitive values", () => {
    assert.ok(!isAttachment("string"));
    assert.ok(!isAttachment(123));
    assert.ok(!isAttachment(true));
  });

  it("should return false for empty object", () => {
    assert.ok(!isAttachment({}));
  });

  it("should return false when missing inline property", () => {
    const obj = {
      filename: "test.pdf",
      content: new Uint8Array([1, 2, 3]),
      contentType: "application/pdf",
      contentId: "test-id",
    };

    assert.ok(!isAttachment(obj));
  });

  it("should return false when missing filename property", () => {
    const obj = {
      inline: false,
      content: new Uint8Array([1, 2, 3]),
      contentType: "application/pdf",
      contentId: "test-id",
    };

    assert.ok(!isAttachment(obj));
  });

  it("should return false when missing content property", () => {
    const obj = {
      inline: false,
      filename: "test.pdf",
      contentType: "application/pdf",
      contentId: "test-id",
    };

    assert.ok(!isAttachment(obj));
  });

  it("should return false when missing contentType property", () => {
    const obj = {
      inline: false,
      filename: "test.pdf",
      content: new Uint8Array([1, 2, 3]),
      contentId: "test-id",
    };

    assert.ok(!isAttachment(obj));
  });

  it("should return false when missing contentId property", () => {
    const obj = {
      inline: false,
      filename: "test.pdf",
      content: new Uint8Array([1, 2, 3]),
      contentType: "application/pdf",
    };

    assert.ok(!isAttachment(obj));
  });

  it("should return false when inline is not boolean", () => {
    const obj = {
      inline: "false",
      filename: "test.pdf",
      content: new Uint8Array([1, 2, 3]),
      contentType: "application/pdf",
      contentId: "test-id",
    };

    assert.ok(!isAttachment(obj));
  });

  it("should return false when filename is not string", () => {
    const obj = {
      inline: false,
      filename: 123,
      content: new Uint8Array([1, 2, 3]),
      contentType: "application/pdf",
      contentId: "test-id",
    };

    assert.ok(!isAttachment(obj));
  });

  it("should return false when content is not Uint8Array or Promise", () => {
    const obj = {
      inline: false,
      filename: "test.pdf",
      content: "invalid content",
      contentType: "application/pdf",
      contentId: "test-id",
    };

    assert.ok(!isAttachment(obj));
  });

  it("should return false when contentType is not string", () => {
    const obj = {
      inline: false,
      filename: "test.pdf",
      content: new Uint8Array([1, 2, 3]),
      contentType: 123,
      contentId: "test-id",
    };

    assert.ok(!isAttachment(obj));
  });

  it("should return false when contentId is not string", () => {
    const obj = {
      inline: false,
      filename: "test.pdf",
      content: new Uint8Array([1, 2, 3]),
      contentType: "application/pdf",
      contentId: 123,
    };

    assert.ok(!isAttachment(obj));
  });

  it("should return false when content is not a proper Promise", () => {
    const obj = {
      inline: false,
      filename: "test.pdf",
      content: { then: "not a function" },
      contentType: "application/pdf",
      contentId: "test-id",
    };

    assert.ok(!isAttachment(obj));
  });
});

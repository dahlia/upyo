import type { Message } from "@upyo/core";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  resolveSmtpEnvelope,
  SmtpEnvelopeValidationError,
} from "./envelope.ts";

const message: Message = {
  sender: { address: "sender@example.com" },
  recipients: [{ address: "recipient@example.com" }],
  ccRecipients: [{ address: "copy@example.com" }],
  bccRecipients: [{ address: "blind@example.com" }],
  replyRecipients: [],
  subject: "Envelope test",
  content: { text: "Hello" },
  attachments: [],
  priority: "normal",
  tags: [],
  headers: new Headers(),
};

describe("resolveSmtpEnvelope", () => {
  test("should derive the envelope when no override is provided", () => {
    assert.deepEqual(resolveSmtpEnvelope(message), {
      from: "sender@example.com",
      to: [
        "recipient@example.com",
        "copy@example.com",
        "blind@example.com",
      ],
    });
  });

  test("should override the sender and recipients independently", () => {
    assert.deepEqual(
      resolveSmtpEnvelope(message, { from: "bounce@example.com" }),
      {
        from: "bounce@example.com",
        to: [
          "recipient@example.com",
          "copy@example.com",
          "blind@example.com",
        ],
      },
    );
    assert.deepEqual(
      resolveSmtpEnvelope(message, { to: ["forward@example.net"] }),
      {
        from: "sender@example.com",
        to: ["forward@example.net"],
      },
    );
  });

  test("should preserve an explicit null reverse-path", () => {
    assert.deepEqual(resolveSmtpEnvelope(message, { from: null }), {
      from: null,
      to: [
        "recipient@example.com",
        "copy@example.com",
        "blind@example.com",
      ],
    });
  });

  test("should reject an empty recipient list", () => {
    assert.throws(
      () => resolveSmtpEnvelope(message, { to: [] }),
      new SmtpEnvelopeValidationError(
        "SMTP envelope must contain at least one recipient.",
      ),
    );
  });

  test("should reject invalid sender and recipient addresses", () => {
    assert.throws(
      () =>
        resolveSmtpEnvelope(message, {
          from: "sender@example.com\r\nRCPT TO:<root@example.com>",
        }),
      /sender must be a valid email address or null/,
    );
    assert.throws(
      () =>
        resolveSmtpEnvelope(message, {
          to: ["recipient@example.com\r\nDATA"],
        }),
      /recipient at index 0 must be a valid email address/,
    );
  });

  test("should validate addresses derived from Message", () => {
    assert.throws(
      () =>
        resolveSmtpEnvelope({
          ...message,
          sender: {
            address: "sender@example.com\r\nRCPT TO:<root@example.com>",
          },
        }),
      /sender must be a valid email address or null/,
    );
  });
});

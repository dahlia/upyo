import type { EmailAddress, Message } from "@upyo/core";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { resolveSmtpDsn, SmtpDsnValidationError } from "./delivery-status.ts";

const message: Message = {
  sender: { address: "sender@example.com" },
  recipients: [{ address: "recipient@example.com" }],
  ccRecipients: [],
  bccRecipients: [],
  replyRecipients: [],
  subject: "DSN test",
  content: { text: "Hello" },
  attachments: [],
  priority: "normal",
  tags: [],
  headers: new Headers(),
};

function createMessageForRecipient(address: EmailAddress): Message {
  return {
    ...message,
    recipients: [{ address }],
  };
}

describe("resolveSmtpDsn", () => {
  test("should omit DSN parameters when no setting is requested", () => {
    assert.equal(resolveSmtpDsn(message, undefined), undefined);
    assert.equal(resolveSmtpDsn(message, {}), undefined);
    assert.equal(
      resolveSmtpDsn(message, {
        recipients: { "recipient@example.com": {} },
      }),
      undefined,
    );
  });

  test("should accept the RFC 3461 ENVID length limit", () => {
    const dsn = resolveSmtpDsn(message, { envelopeId: "a".repeat(94) });
    assert.equal(dsn?.mailParameters[0].length, 100);
  });

  test("should reject an empty ENVID", () => {
    assert.throws(
      () => resolveSmtpDsn(message, { envelopeId: "" }),
      new SmtpDsnValidationError("DSN envelope ID must not be empty."),
    );
  });

  test("should reject ENVID above the RFC 3461 length limit", () => {
    assert.throws(
      () => resolveSmtpDsn(message, { envelopeId: "a".repeat(95) }),
      new SmtpDsnValidationError(
        "ENVID parameter exceeds the RFC 3461 limit of 100 characters.",
      ),
    );
  });

  test("should accept the RFC 3461 ORCPT length limit", () => {
    const address = `${"a".repeat(485)}@b` as const;
    const dsn = resolveSmtpDsn(createMessageForRecipient(address), {
      recipients: {
        [address]: { originalRecipient: address },
      },
    });
    assert.equal(dsn?.recipientParameters[0][0].length, 500);
  });

  test("should reject ORCPT above the RFC 3461 length limit", () => {
    const address = `${"a".repeat(486)}@b` as const;
    assert.throws(
      () =>
        resolveSmtpDsn(createMessageForRecipient(address), {
          recipients: {
            [address]: { originalRecipient: address },
          },
        }),
      new SmtpDsnValidationError(
        "ORCPT parameter exceeds the RFC 3461 limit of 500 characters.",
      ),
    );
  });

  test("should reject an ORCPT that differs from its envelope recipient", () => {
    assert.throws(
      () =>
        resolveSmtpDsn(message, {
          recipients: {
            "recipient@example.com": {
              originalRecipient: "forwarded@example.com",
            },
          },
        }),
      new SmtpDsnValidationError(
        "DSN original recipient for recipient@example.com must match the " +
          "envelope recipient address.",
      ),
    );
  });

  test("should reject an empty notification condition list", () => {
    assert.throws(
      () =>
        resolveSmtpDsn(message, {
          recipients: {
            "recipient@example.com": { notify: [] },
          },
        }),
      /must be a non-empty array/,
    );
  });
});

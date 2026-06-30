import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyHttpStatus,
  classifyReceiptError,
  createFailedReceipt,
  createReceiptError,
  parseRetryAfter,
  type Receipt,
  type ReceiptError,
} from "./receipt.ts";
import type { Transport } from "./transport.ts";

describe("Receipt errors", () => {
  it("classifies HTTP statuses into retryable receipt categories", () => {
    assert.deepEqual(classifyHttpStatus(401), {
      category: "auth",
      retryable: false,
    });
    assert.deepEqual(classifyHttpStatus(429), {
      category: "rate-limit",
      retryable: true,
    });
    assert.deepEqual(classifyHttpStatus(409), {
      category: "validation",
      retryable: false,
    });
    assert.deepEqual(classifyHttpStatus(422), {
      category: "validation",
      retryable: false,
    });
    assert.deepEqual(classifyHttpStatus(500), {
      category: "server-error",
      retryable: true,
    });
    assert.deepEqual(classifyHttpStatus(503), {
      category: "service-unavailable",
      retryable: true,
    });
  });

  it("parses Retry-After seconds and HTTP dates", () => {
    assert.equal(parseRetryAfter("120"), 120_000);
    assert.equal(parseRetryAfter("0"), 0);

    const now = new Date("2026-06-30T00:00:00.000Z");
    const retryAt = "Tue, 30 Jun 2026 00:02:00 GMT";
    assert.equal(parseRetryAfter(retryAt, now), 120_000);
  });

  it("ignores missing, invalid, and past Retry-After values", () => {
    const now = new Date("2026-06-30T00:00:00.000Z");

    assert.equal(parseRetryAfter(null, now), undefined);
    assert.equal(parseRetryAfter("", now), undefined);
    assert.equal(parseRetryAfter("not a date", now), undefined);
    assert.equal(
      parseRetryAfter("Mon, 29 Jun 2026 00:00:00 GMT", now),
      undefined,
    );
  });

  it("creates structured receipt errors from HTTP status metadata", () => {
    const error = createReceiptError("Too Many Requests", {
      provider: "sendgrid",
      statusCode: 429,
      retryAfterMilliseconds: 30_000,
      providerDetails: { requestId: "req_123" },
    });

    assert.deepEqual(error, {
      message: "Too Many Requests",
      category: "rate-limit",
      code: "http.429",
      retryable: true,
      provider: "sendgrid",
      statusCode: 429,
      retryAfterMilliseconds: 30_000,
      providerDetails: { requestId: "req_123" },
    });
  });

  it("creates failed receipts with summary metadata", () => {
    const receipt = createFailedReceipt("Network error", {
      provider: "mailgun",
      category: "network",
      retryable: true,
      attempts: 3,
      timestamp: "2026-06-30T00:00:00.000Z",
    });

    assert.deepEqual(receipt, {
      successful: false,
      errorMessages: ["Network error"],
      errors: [{
        message: "Network error",
        category: "network",
        code: "network",
        retryable: true,
        provider: "mailgun",
      }],
      retryable: true,
      provider: "mailgun",
      attempts: 3,
      timestamp: "2026-06-30T00:00:00.000Z",
    });
  });

  it("keeps legacy failed receipts assignable", () => {
    const receipt: Receipt = {
      successful: false,
      errorMessages: ["Legacy failure"],
    };

    assert.equal(receipt.successful, false);
    assert.deepEqual(receipt.errorMessages, ["Legacy failure"]);
  });

  it("classifies generic errors without HTTP metadata", () => {
    assert.deepEqual(classifyReceiptError(new Error("Connection timed out")), {
      category: "timeout",
      retryable: true,
      code: "timeout",
    });
    assert.deepEqual(classifyReceiptError(new Error("Invalid API key")), {
      category: "auth",
      retryable: false,
      code: "auth",
    });
    assert.deepEqual(classifyReceiptError("Something unexpected"), {
      category: "unknown",
      retryable: false,
      code: "unknown",
    });
    assert.deepEqual(
      classifyReceiptError("Author domain failed policy checks"),
      {
        category: "unknown",
        retryable: false,
        code: "unknown",
      },
    );
    assert.deepEqual(
      classifyReceiptError("Certification authority unavailable"),
      {
        category: "unknown",
        retryable: false,
        code: "unknown",
      },
    );
  });

  it("classifies error-like objects with message and name properties", () => {
    assert.deepEqual(
      classifyReceiptError({
        name: "NetworkError",
        message: "socket disconnected",
      }),
      {
        category: "network",
        retryable: true,
        code: "network",
      },
    );
  });

  it("honors explicit category overrides when deriving error codes", () => {
    const error = createReceiptError("Provider rejected the message", {
      category: "rejected",
    });

    assert.equal(error.category, "rejected");
    assert.equal(error.code, "rejected");
  });

  it("keeps HTTP status codes when explicit categories are provided", () => {
    const error = createReceiptError("Too many requests", {
      category: "rate-limit",
      statusCode: 429,
    });

    assert.equal(error.category, "rate-limit");
    assert.equal(error.code, "http.429");
  });
});

const typedError: ReceiptError<"mailgun"> = createReceiptError(
  "Too many requests",
  { provider: "mailgun", statusCode: 429 },
);
const typedErrorProvider: "mailgun" | undefined = typedError.provider;

const typedReceipt: Receipt<"sendgrid"> = createFailedReceipt(
  "Too many requests",
  { provider: "sendgrid", statusCode: 429 },
);
const typedReceiptProvider: "sendgrid" | undefined = typedReceipt.provider;

const typedTransport: Transport<"smtp"> = {
  id: "smtp",
  send(): Promise<Receipt<"smtp">> {
    return Promise.resolve({
      successful: true,
      messageId: "message-id",
      provider: "smtp",
    });
  },
  async *sendMany(): AsyncIterable<Receipt<"smtp">> {
    yield {
      successful: true,
      messageId: "message-id",
      provider: "smtp",
    };
  },
};
const typedTransportId: "smtp" = typedTransport.id;

void typedErrorProvider;
void typedReceiptProvider;
void typedTransportId;

import { createMessage, type ReceiptErrorCategory } from "@upyo/core";
import type {
  CloudflareBindingMessage,
  CloudflareEmailBinding,
  CloudflareEmailSendResult,
} from "./binding.ts";
import { CloudflareWorkerTransport } from "./worker-transport.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

/**
 * A stand-in for `env.EMAIL` that records what it was asked to send.
 */
class FakeBinding implements CloudflareEmailBinding {
  readonly calls: CloudflareBindingMessage[] = [];

  constructor(
    private readonly handler: (
      message: CloudflareBindingMessage,
    ) => Promise<CloudflareEmailSendResult> = () =>
      Promise.resolve({ messageId: "<id@cf>" }),
  ) {}

  send(message: CloudflareBindingMessage): Promise<CloudflareEmailSendResult> {
    this.calls.push(message);
    return this.handler(message);
  }
}

function bindingError(code: string, message = `${code} happened.`): Error {
  return Object.assign(new Error(message), { code });
}

const message = createMessage({
  from: "sender@example.com",
  to: "Sykez <sykez@example.com>",
  subject: "Hello",
  content: { text: "Hi" },
});

describe("CloudflareWorkerTransport send", () => {
  it("sends through the binding and returns its message ID", async () => {
    const binding = new FakeBinding();
    const receipt = await new CloudflareWorkerTransport({ binding }).send(
      message,
    );
    assert.ok(receipt.successful);
    assert.equal(receipt.messageId, "<id@cf>");
    assert.equal(receipt.provider, "cloudflare");
    assert.equal(binding.calls.length, 1);
    assert.deepEqual(binding.calls[0].to, [
      { name: "Sykez", email: "sykez@example.com" },
    ]);
  });

  it("fails without retrying when the binding returns no message ID", async () => {
    const binding = new FakeBinding(() => Promise.resolve({ messageId: "" }));
    const receipt = await new CloudflareWorkerTransport({ binding }).send(
      message,
    );
    assert.ok(!receipt.successful);
    assert.equal(receipt.errors?.[0].code, "cloudflare.missing_message_id");
    assert.ok(!receipt.retryable);
  });

  it("rejects a message before calling the binding", async () => {
    const binding = new FakeBinding();
    const receipt = await new CloudflareWorkerTransport({ binding }).send(
      createMessage({
        from: "sender@example.com",
        to: "to@example.com",
        subject: "Hi",
        content: { text: "x" },
        headers: { "Message-ID": "<x@example.com>" },
      }),
    );
    assert.ok(!receipt.successful);
    assert.equal(receipt.errors?.[0].code, "cloudflare.header_not_allowed");
    assert.equal(receipt.errors?.[0].category, "validation");
    assert.ok(!receipt.retryable);
    assert.equal(binding.calls.length, 0);
  });

  it("does not report a failing attachment read as a validation error", async () => {
    const binding = new FakeBinding();
    const receipt = await new CloudflareWorkerTransport({ binding }).send(
      createMessage({
        from: "sender@example.com",
        to: "to@example.com",
        subject: "Hi",
        content: { text: "x" },
        attachments: [
          {
            inline: false,
            contentId: "",
            filename: "remote.pdf",
            contentType: "application/pdf",
            content: () => Promise.reject(new TypeError("fetch failed")),
          },
        ],
      }),
    );
    assert.ok(!receipt.successful);
    assert.notEqual(receipt.errors?.[0].category, "validation");
    assert.ok(receipt.retryable);
    assert.equal(binding.calls.length, 0);
  });

  it("requires a binding", () => {
    assert.throws(
      () =>
        new CloudflareWorkerTransport({
          binding: {} as CloudflareEmailBinding,
        }),
      TypeError,
    );
  });
});

describe("CloudflareWorkerTransport binding errors", () => {
  const cases: ReadonlyArray<readonly [string, ReceiptErrorCategory, boolean]> =
    [
      ["E_RATE_LIMIT_EXCEEDED", "rate-limit", true],
      ["E_DAILY_LIMIT_EXCEEDED", "rate-limit", false],
      ["E_INTERNAL_SERVER_ERROR", "server-error", true],
      ["E_DELIVERY_FAILED", "unknown", true],
      ["E_SENDER_NOT_VERIFIED", "configuration", false],
      ["E_SENDER_DOMAIN_NOT_AVAILABLE", "configuration", false],
      ["E_RECIPIENT_NOT_ALLOWED", "configuration", false],
      ["E_RECIPIENT_SUPPRESSED", "rejected", false],
      ["E_VALIDATION_ERROR", "validation", false],
      ["E_FIELD_MISSING", "validation", false],
      ["E_TOO_MANY_RECIPIENTS", "validation", false],
      ["E_TOO_MANY_ATTACHMENTS", "validation", false],
      ["E_ACCOUNT_SUSPENDED", "configuration", false],
      ["E_CONTENT_TOO_LARGE", "validation", false],
      ["E_HEADER_NOT_ALLOWED", "validation", false],
      ["E_HEADER_USE_API_FIELD", "validation", false],
      ["E_HEADER_VALUE_INVALID", "validation", false],
      ["E_HEADER_VALUE_TOO_LONG", "validation", false],
      ["E_HEADER_NAME_INVALID", "validation", false],
      ["E_HEADERS_TOO_LARGE", "validation", false],
      ["E_HEADERS_TOO_MANY", "validation", false],
    ];

  for (const [code, category, retryable] of cases) {
    it(`maps ${code} to ${category}, retryable: ${retryable}`, async () => {
      const binding = new FakeBinding(() =>
        Promise.reject(bindingError(code, "Cloudflare said no.")),
      );
      const receipt = await new CloudflareWorkerTransport({
        binding,
        retries: 0,
      }).send(message);
      assert.ok(!receipt.successful);
      assert.deepEqual(receipt.errorMessages, ["Cloudflare said no."]);
      assert.equal(binding.calls.length, 1);
      const error = receipt.errors?.[0];
      assert.equal(error?.code, `cloudflare.${code}`);
      assert.equal(error?.category, category);
      assert.equal(error?.retryable, retryable);
      assert.equal(receipt.retryable, retryable);
      assert.deepEqual(error?.providerDetails, {
        code,
        message: "Cloudflare said no.",
      });
    });
  }

  it("classifies an unknown code by its message", async () => {
    const binding = new FakeBinding(() =>
      Promise.reject(bindingError("E_SOMETHING_NEW", "Rate limit reached.")),
    );
    const receipt = await new CloudflareWorkerTransport({ binding }).send(
      message,
    );
    assert.ok(!receipt.successful);
    assert.equal(receipt.errors?.[0].code, "cloudflare.E_SOMETHING_NEW");
    assert.equal(receipt.errors?.[0].category, "rate-limit");
  });

  it("handles an error without a code, or a thrown non-error", async () => {
    const plain = await new CloudflareWorkerTransport({
      binding: new FakeBinding(() => Promise.reject(new Error("Boom."))),
    }).send(message);
    assert.ok(!plain.successful);
    assert.deepEqual(plain.errorMessages, ["Boom."]);

    const odd = await new CloudflareWorkerTransport({
      binding: new FakeBinding(() => Promise.reject("kaboom")),
    }).send(message);
    assert.ok(!odd.successful);
    assert.deepEqual(odd.errorMessages, ["kaboom"]);
  });
});

describe("CloudflareWorkerTransport retries", () => {
  it("retries up to 3 times by default", () => {
    const transport = new CloudflareWorkerTransport({
      binding: new FakeBinding(),
    });
    assert.equal(transport.config.retries, 3);
  });

  it("retries a rate limit and reports the message it then sends", async () => {
    let n = 0;
    const binding = new FakeBinding(() =>
      ++n === 1
        ? Promise.reject(bindingError("E_RATE_LIMIT_EXCEEDED"))
        : Promise.resolve({ messageId: "<id@cf>" }),
    );
    const receipt = await new CloudflareWorkerTransport({
      binding,
      retries: 1,
    }).send(message);
    assert.ok(receipt.successful);
    assert.equal(receipt.messageId, "<id@cf>");
    assert.equal(binding.calls.length, 2);
  });

  it("retries a server error until its retries run out", async () => {
    const binding = new FakeBinding(() =>
      Promise.reject(bindingError("E_INTERNAL_SERVER_ERROR")),
    );
    const receipt = await new CloudflareWorkerTransport({
      binding,
      retries: 1,
    }).send(message);
    assert.ok(!receipt.successful);
    assert.equal(
      receipt.errors?.[0].code,
      "cloudflare.E_INTERNAL_SERVER_ERROR",
    );
    assert.equal(receipt.attempts, 2);
    assert.equal(binding.calls.length, 2);
  });

  for (const code of [
    "E_DELIVERY_FAILED",
    "E_DAILY_LIMIT_EXCEEDED",
    "E_VALIDATION_ERROR",
  ]) {
    it(`does not retry ${code}`, async () => {
      const binding = new FakeBinding(() => Promise.reject(bindingError(code)));
      const receipt = await new CloudflareWorkerTransport({ binding }).send(
        message,
      );
      assert.ok(!receipt.successful);
      assert.equal(receipt.attempts, 1);
      assert.equal(binding.calls.length, 1);
    });
  }

  it("does not retry an error without a code", async () => {
    const binding = new FakeBinding(() => Promise.reject(new Error("Boom.")));
    const receipt = await new CloudflareWorkerTransport({ binding }).send(
      message,
    );
    assert.ok(!receipt.successful);
    assert.equal(binding.calls.length, 1);
  });

  it("throws when aborted while waiting to retry", async () => {
    let called: () => void = () => {};
    const sendCalled = new Promise<void>((resolve) => {
      called = resolve;
    });
    const binding = new FakeBinding(() => {
      called();
      return Promise.reject(bindingError("E_RATE_LIMIT_EXCEEDED"));
    });
    const controller = new AbortController();
    const sending = new CloudflareWorkerTransport({ binding }).send(message, {
      signal: controller.signal,
    });
    await sendCalled;
    controller.abort(new Error("stop"));
    await assert.rejects(sending, /stop/);
    assert.equal(binding.calls.length, 1);
  });
});

describe("CloudflareWorkerTransport cancellation", () => {
  it("throws for an already aborted signal without calling the binding", async () => {
    const binding = new FakeBinding();
    const controller = new AbortController();
    controller.abort(new Error("stop"));
    await assert.rejects(
      new CloudflareWorkerTransport({ binding }).send(message, {
        signal: controller.signal,
      }),
      /stop/,
    );
    assert.equal(binding.calls.length, 0);
  });

  it("stops waiting when aborted during send", async () => {
    let settle: (error: unknown) => void = () => {};
    let called: () => void = () => {};
    const sendCalled = new Promise<void>((resolve) => {
      called = resolve;
    });
    const binding = new FakeBinding(
      () =>
        new Promise((_, reject) => {
          settle = reject;
          called();
        }),
    );
    const controller = new AbortController();
    const sending = new CloudflareWorkerTransport({ binding }).send(message, {
      signal: controller.signal,
    });
    await sendCalled;
    controller.abort(new Error("stop"));
    await assert.rejects(sending, /stop/);
    assert.equal(binding.calls.length, 1);
    // The binding settling later must not surface as an unhandled rejection.
    settle(bindingError("E_INTERNAL_SERVER_ERROR"));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});

describe("CloudflareWorkerTransport sendMany", () => {
  it("sends each message and yields a receipt per message", async () => {
    let n = 0;
    const binding = new FakeBinding(() =>
      ++n === 2
        ? Promise.reject(bindingError("E_VALIDATION_ERROR"))
        : Promise.resolve({ messageId: `<${n}@cf>` }),
    );
    const receipts = [];
    for await (const receipt of new CloudflareWorkerTransport({
      binding,
    }).sendMany([message, message, message]))
      receipts.push(receipt);
    assert.deepEqual(
      receipts.map((r) => r.successful),
      [true, false, true],
    );
    assert.equal(binding.calls.length, 3);
  });
});

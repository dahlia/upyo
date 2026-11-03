import { createMessage } from "@upyo/core";
import { CloudflareTransport } from "./cloudflare-transport.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

// Tests are serialized because they all replace globalThis.fetch.
let chain = Promise.resolve();

interface Call {
  readonly url: string;
  readonly init: RequestInit;
}

async function withFetch<T>(
  responses: readonly ((init: RequestInit) => Response | Promise<Response>)[],
  callback: (calls: Call[]) => Promise<T>,
): Promise<T> {
  const previous = chain;
  let release: () => void = () => {};
  chain = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  const original = globalThis.fetch;
  const calls: Call[] = [];
  try {
    globalThis.fetch = (input, init) => {
      calls.push({ url: String(input), init: init ?? {} });
      const next = responses[Math.min(calls.length, responses.length) - 1];
      return Promise.resolve(next(init ?? {}));
    };
    return await callback(calls);
  } finally {
    globalThis.fetch = original;
    release();
  }
}

const ok =
  (result: Record<string, unknown> = {}) =>
  () =>
    new Response(
      JSON.stringify({
        success: true,
        errors: [],
        result: {
          message_id: "<abc@cf>",
          delivered: ["to@example.com"],
          ...result,
        },
      }),
      { status: 200 },
    );

const fail =
  (status: number, headers: Record<string, string> = {}) =>
  () =>
    new Response(
      JSON.stringify({
        success: false,
        errors: [{ code: 1000, message: "Sender domain not verified" }],
        result: null,
      }),
      { status, headers },
    );

/**
 * A reply whose headers arrive but whose body never finishes, unless the
 * request's signal aborts.
 */
const stalledBody = (init: RequestInit) =>
  new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("{"));
        init.signal?.addEventListener("abort", () => {
          controller.error(init.signal?.reason);
        });
      },
    }),
    { status: 200 },
  );

const message = createMessage({
  from: "sender@example.com",
  to: "to@example.com",
  subject: "Hello",
  content: { text: "Hi" },
});

const config = { accountId: "acc 1", apiToken: "secret", retries: 2 };

describe("CloudflareTransport send", () => {
  it("posts to the account's send endpoint with a bearer token", async () => {
    await withFetch([ok()], async (calls) => {
      const receipt = await new CloudflareTransport(config).send(message);
      assert.ok(receipt.successful);
      assert.equal(receipt.messageId, "<abc@cf>");
      assert.equal(receipt.provider, "cloudflare");
      assert.equal(
        calls[0].url,
        "https://api.cloudflare.com/client/v4/accounts/acc%201/email/sending/send",
      );
      const headers = new Headers(calls[0].init.headers);
      assert.equal(headers.get("Authorization"), "Bearer secret");
      assert.equal(headers.get("Content-Type"), "application/json");
      const body = JSON.parse(String(calls[0].init.body));
      assert.deepEqual(body.from, { address: "sender@example.com" });
      assert.deepEqual(body.to, ["to@example.com"]);
    });
  });

  it("returns a failed receipt with the API error and no retry on 400", async () => {
    await withFetch([fail(400)], async (calls) => {
      const receipt = await new CloudflareTransport(config).send(message);
      assert.ok(!receipt.successful);
      assert.match(receipt.errorMessages[0], /Sender domain not verified/);
      assert.equal(receipt.errors?.[0].statusCode, 400);
      assert.equal(calls.length, 1);
    });
  });

  it("retries 429 responses and then succeeds", async () => {
    await withFetch(
      [fail(429, { "Retry-After": "0" }), ok()],
      async (calls) => {
        const receipt = await new CloudflareTransport(config).send(message);
        assert.ok(receipt.successful);
        assert.equal(calls.length, 2);
      },
    );
  });

  it("gives up after the configured retries", async () => {
    await withFetch([fail(500, { "Retry-After": "0" })], async (calls) => {
      const receipt = await new CloudflareTransport(config).send(message);
      assert.ok(!receipt.successful);
      assert.equal(calls.length, 3);
      assert.equal(receipt.attempts, 3);
      assert.ok(receipt.retryable);
    });
  });

  it("does not retry network failures", async () => {
    let attempts = 0;
    await withFetch(
      [
        () => {
          attempts++;
          throw new TypeError("fetch failed");
        },
      ],
      async () => {
        const receipt = await new CloudflareTransport(config).send(message);
        assert.ok(!receipt.successful);
        assert.notEqual(receipt.errors?.[0].category, "validation");
        assert.equal(attempts, 1);
      },
    );
  });

  it("fails when every recipient permanently bounced", async () => {
    await withFetch(
      [ok({ delivered: [], permanent_bounces: ["to@example.com"] })],
      async () => {
        const receipt = await new CloudflareTransport(config).send(message);
        assert.ok(!receipt.successful);
        assert.match(receipt.errorMessages[0], /to@example.com/);
      },
    );
  });

  it("rethrows a caller abort", async () => {
    const controller = new AbortController();
    controller.abort(new Error("stop"));
    await withFetch([ok()], async (calls) => {
      await assert.rejects(
        new CloudflareTransport(config).send(message, {
          signal: controller.signal,
        }),
        /stop/,
      );
      assert.equal(calls.length, 0);
    });
  });

  it("requires an account ID and API token", () => {
    assert.throws(
      () => new CloudflareTransport({ accountId: "", apiToken: "x" }),
      TypeError,
    );
  });
});

describe("CloudflareTransport sendMany", () => {
  it("sends each message and yields a receipt per message", async () => {
    await withFetch([ok(), fail(400), ok()], async (calls) => {
      const receipts = [];
      for await (const r of new CloudflareTransport(config).sendMany([
        message,
        message,
        message,
      ]))
        receipts.push(r);
      assert.deepEqual(
        receipts.map((r) => r.successful),
        [true, false, true],
      );
      assert.equal(calls.length, 3);
    });
  });
});

describe("CloudflareTransport error reporting", () => {
  it("reports Cloudflare's error code and details on the receipt", async () => {
    await withFetch([fail(400)], async () => {
      const receipt = await new CloudflareTransport(config).send(message);
      assert.ok(!receipt.successful);
      const error = receipt.errors?.[0];
      assert.equal(error?.code, "cloudflare.1000");
      assert.equal(error?.statusCode, 400);
      assert.deepEqual(error?.providerDetails, [
        { code: 1000, message: "Sender domain not verified" },
      ]);
    });
  });

  it("falls back to the HTTP status when there is no error code", async () => {
    await withFetch(
      [() => new Response("Bad gateway", { status: 502 })],
      async () => {
        const receipt = await new CloudflareTransport({
          ...config,
          retries: 0,
        }).send(message);
        assert.ok(!receipt.successful);
        assert.equal(receipt.errors?.[0].code, "cloudflare.502");
      },
    );
  });

  it("fails without retrying when a 200 reply is not JSON", async () => {
    await withFetch(
      [() => new Response("<html>OK</html>", { status: 200 })],
      async (calls) => {
        const receipt = await new CloudflareTransport(config).send(message);
        assert.ok(!receipt.successful);
        assert.deepEqual(receipt.errorMessages, [
          "Cloudflare API answered with a body that is not a JSON object.",
        ]);
        assert.equal(calls.length, 1);
      },
    );
  });

  it("fails without retrying when a 200 reply reports a failure", async () => {
    await withFetch(
      [
        () =>
          new Response(
            JSON.stringify({
              success: false,
              errors: [{ code: 10202, message: "Invalid email." }],
              result: null,
            }),
            { status: 200 },
          ),
      ],
      async (calls) => {
        const receipt = await new CloudflareTransport(config).send(message);
        assert.ok(!receipt.successful);
        assert.deepEqual(receipt.errorMessages, [
          "Invalid email. (code 10202)",
        ]);
        assert.equal(receipt.errors?.[0].code, "cloudflare.10202");
        assert.equal(calls.length, 1);
      },
    );
  });

  it("returns a non-retryable validation receipt without calling the API", async () => {
    await withFetch([ok()], async (calls) => {
      const receipt = await new CloudflareTransport(config).send(
        createMessage({
          from: "sender@example.com",
          to: "to@example.com",
          subject: "Hi",
          content: { text: "x" },
          headers: { "Message-ID": "<x@example.com>" },
        }),
      );
      assert.ok(!receipt.successful);
      assert.equal(receipt.errors?.[0].category, "validation");
      assert.equal(receipt.errors?.[0].code, "cloudflare.header_not_allowed");
      assert.ok(!receipt.retryable);
      assert.equal(calls.length, 0);
    });
  });

  it("treats an invalid message identifier as a validation failure", async () => {
    await withFetch([ok()], async (calls) => {
      // createMessage() would reject the identifier, so it is set afterward,
      // as a message built by hand could carry it.
      const receipt = await new CloudflareTransport(config).send({
        ...message,
        inReplyTo: ["not an id"],
      });
      assert.ok(!receipt.successful);
      assert.match(receipt.errorMessages[0], /not an id/);
      assert.equal(receipt.errors?.[0].category, "validation");
      assert.ok(!receipt.retryable);
      assert.equal(calls.length, 0);
    });
  });
});

describe("CloudflareTransport delivery outcome", () => {
  it("succeeds when every recipient was only queued", async () => {
    await withFetch(
      [ok({ delivered: [], queued: ["to@example.com"] })],
      async () => {
        const receipt = await new CloudflareTransport(config).send(message);
        assert.ok(receipt.successful);
      },
    );
  });

  it("fails when every recipient was suppressed", async () => {
    await withFetch(
      [ok({ delivered: [], suppressed_recipients: ["to@example.com"] })],
      async () => {
        const receipt = await new CloudflareTransport(config).send(message);
        assert.ok(!receipt.successful);
        assert.equal(receipt.errors?.[0].category, "rejected");
        assert.ok(!receipt.retryable);
        assert.match(receipt.errorMessages[0], /to@example.com/);
      },
    );
  });

  it("succeeds when some recipients were accepted", async () => {
    await withFetch(
      [
        ok({
          delivered: [],
          queued: ["a@example.com"],
          suppressed_recipients: ["b@example.com"],
        }),
      ],
      async () => {
        const receipt = await new CloudflareTransport(config).send(message);
        assert.ok(receipt.successful);
      },
    );
  });

  it("fails without retrying when the reply has no message ID", async () => {
    await withFetch([ok({ message_id: undefined })], async (calls) => {
      const receipt = await new CloudflareTransport(config).send(message);
      assert.ok(!receipt.successful);
      assert.equal(receipt.errors?.[0].code, "cloudflare.missing_message_id");
      assert.ok(!receipt.retryable);
      assert.equal(calls.length, 1);
    });
  });
});

describe("CloudflareTransport failure classification", () => {
  it("reports the attempt on which a timeout happened", async () => {
    await withFetch(
      [
        fail(429, { "Retry-After": "0" }),
        (init) =>
          new Promise<Response>((_, reject) => {
            init.signal?.addEventListener("abort", () => {
              reject(new DOMException("Aborted", "AbortError"));
            });
          }),
      ],
      async () => {
        const receipt = await new CloudflareTransport({
          ...config,
          timeout: 20,
        }).send(message);
        assert.ok(!receipt.successful);
        assert.match(receipt.errorMessages[0], /timed out/);
        assert.equal(receipt.attempts, 2);
      },
    );
  });

  it(
    "times out while reading a stalled reply body",
    { timeout: 5000 },
    async () => {
      await withFetch([stalledBody], async () => {
        const receipt = await new CloudflareTransport({
          ...config,
          timeout: 20,
          retries: 0,
        }).send(message);
        assert.ok(!receipt.successful);
        assert.match(receipt.errorMessages[0], /timed out/);
      });
    },
  );

  it(
    "rethrows a caller abort while reading the reply body",
    { timeout: 5000 },
    async () => {
      // Without AbortSignal.any, core combines signals with listeners that
      // its cleanup removes, which used to detach the caller before the body
      // was read.
      const any = Object.getOwnPropertyDescriptor(AbortSignal, "any");
      Object.defineProperty(AbortSignal, "any", {
        configurable: true,
        value: undefined,
      });
      try {
        await withFetch([stalledBody], async () => {
          const controller = new AbortController();
          const sending = new CloudflareTransport(config).send(message, {
            signal: controller.signal,
          });
          setTimeout(() => controller.abort(new Error("stop")), 20);
          await assert.rejects(sending, /stop/);
        });
      } finally {
        if (any != null) Object.defineProperty(AbortSignal, "any", any);
      }
    },
  );

  it("does not report a failing attachment read as a validation error", async () => {
    await withFetch([ok()], async (calls) => {
      const receipt = await new CloudflareTransport(config).send(
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
      assert.equal(calls.length, 0);
    });
  });
});

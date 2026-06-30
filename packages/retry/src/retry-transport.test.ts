import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createFailedReceipt,
  createMessage,
  createReceiptError,
  type Message,
  type Receipt,
  type Transport,
  type TransportOptions,
} from "@upyo/core";
import {
  createRetryTransport,
  type DelayContext,
  RetryTransport,
} from "./index.ts";

describe("RetryTransport", () => {
  it("retries retryable failed receipts and returns the later success", async () => {
    const delays: DelayContext[] = [];
    const base = new SequenceTransport([
      createFailedReceipt("Too many requests", {
        provider: "base",
        statusCode: 429,
      }),
      { successful: true, messageId: "delivered" },
    ]);
    const transport = new RetryTransport(base, {
      maxAttempts: 3,
      backoff: { baseDelayMilliseconds: 100 },
      jitter: false,
      wait: (context) => {
        delays.push(context);
        return Promise.resolve();
      },
    });

    const receipt = await transport.send(message());

    assert.equal(base.calls, 2);
    assert.equal(receipt.successful, true);
    assert.equal(receipt.messageId, "delivered");
    assert.equal(receipt.provider, "base");
    assert.equal(receipt.attempts, 2);
    assert.deepEqual(delays.map((delay) => delay.delayMilliseconds), [100]);
  });

  it("does not retry permanent failed receipts", async () => {
    const waits: DelayContext[] = [];
    const base = new SequenceTransport([
      createFailedReceipt("Invalid recipient", {
        provider: "base",
        category: "validation",
        retryable: false,
      }),
      { successful: true, messageId: "should-not-send" },
    ]);
    const transport = createRetryTransport(base, {
      maxAttempts: 3,
      wait: (context) => {
        waits.push(context);
        return Promise.resolve();
      },
    });

    const receipt = await transport.send(message());

    assert.equal(base.calls, 1);
    assert.equal(receipt.successful, false);
    assert.deepEqual(receipt.errorMessages, ["Invalid recipient"]);
    assert.equal(receipt.provider, "base");
    assert.equal(receipt.attempts, 1);
    assert.equal(waits.length, 0);
  });

  it("uses capped Retry-After metadata before computed backoff", async () => {
    const delays: number[] = [];
    const base = new SequenceTransport([
      createFailedReceipt(createReceiptError("Rate limited", {
        provider: "base",
        statusCode: 429,
        retryAfterMilliseconds: 5_000,
      })),
      { successful: true, messageId: "delivered" },
    ]);
    const transport = createRetryTransport(base, {
      maxAttempts: 2,
      backoff: {
        baseDelayMilliseconds: 100,
        maxDelayMilliseconds: 2_000,
      },
      jitter: false,
      wait: (context) => {
        delays.push(context.delayMilliseconds);
        return Promise.resolve();
      },
    });

    await transport.send(message());

    assert.deepEqual(delays, [2_000]);
  });

  it("retries transient thrown errors and converts exhaustion to a receipt", async () => {
    const base = new SequenceTransport([
      new Error("Connection reset by peer"),
      new Error("Connection reset by peer"),
    ]);
    const transport = createRetryTransport(base, {
      maxAttempts: 2,
      jitter: false,
      wait: () => Promise.resolve(),
    });

    const receipt = await transport.send(message());

    assert.equal(base.calls, 2);
    assert.equal(receipt.successful, false);
    assert.deepEqual(receipt.errorMessages, ["Connection reset by peer"]);
    assert.equal(receipt.retryable, true);
    assert.equal(receipt.provider, "base");
    assert.equal(receipt.attempts, 2);
    assert.equal(receipt.errors?.[0]?.category, "network");
  });

  it("retries provider AbortError timeouts", async () => {
    const base = new SequenceTransport([
      createAbortError("Request timed out."),
      { successful: true, messageId: "delivered" },
    ]);
    const transport = createRetryTransport(base, {
      maxAttempts: 2,
      jitter: false,
      wait: () => Promise.resolve(),
    });

    const receipt = await transport.send(message());

    assert.equal(base.calls, 2);
    assert.equal(receipt.successful, true);
    assert.equal(receipt.messageId, "delivered");
    assert.equal(receipt.attempts, 2);
  });

  it("lets custom retry policy classify provider AbortErrors", async () => {
    const errors: unknown[] = [];
    const base = new SequenceTransport([
      createAbortError(),
      { successful: true, messageId: "delivered" },
    ]);
    const transport = createRetryTransport(base, {
      maxAttempts: 2,
      wait: () => Promise.resolve(),
      shouldRetry: (result) => {
        if (result instanceof Error) errors.push(result);
        return result instanceof Error && result.name === "AbortError";
      },
    });

    const receipt = await transport.send(message());

    assert.equal(base.calls, 2);
    assert.equal(receipt.successful, true);
    assert.equal(errors.length, 1);
    assert.equal(errors[0], base.results[0]);
  });

  it("does not retry caller cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    const base = new SequenceTransport([
      { successful: true, messageId: "should-not-send" },
    ]);
    const transport = createRetryTransport(base);

    await assert.rejects(
      () => transport.send(message(), { signal: controller.signal }),
      { name: "AbortError" },
    );
    assert.equal(base.calls, 0);
  });

  it("stops retrying when aborted during the retry wait", async () => {
    const controller = new AbortController();
    const base = new SequenceTransport([
      createFailedReceipt("Service unavailable", {
        provider: "base",
        statusCode: 503,
      }),
      { successful: true, messageId: "should-not-send" },
    ]);
    const transport = createRetryTransport(base, {
      maxAttempts: 2,
      jitter: false,
      wait: (_context, signal) => {
        controller.abort();
        signal?.throwIfAborted();
        return Promise.resolve();
      },
    });

    await assert.rejects(
      () => transport.send(message(), { signal: controller.signal }),
      { name: "AbortError" },
    );
    assert.equal(base.calls, 1);
  });

  it("retries sendMany messages in input order", async () => {
    const base = new SequenceTransport([
      createFailedReceipt("Temporarily unavailable", {
        provider: "base",
        statusCode: 503,
      }),
      { successful: true, messageId: "first" },
      { successful: true, messageId: "second" },
    ]);
    const transport = createRetryTransport(base, {
      maxAttempts: 2,
      jitter: false,
      wait: () => Promise.resolve(),
    });

    const receipts = await collect(transport.sendMany([
      message("First"),
      message("Second"),
    ]));

    assert.equal(base.calls, 3);
    assert.deepEqual(
      receipts.map((receipt) => receipt.successful && receipt.messageId),
      ["first", "second"],
    );
  });

  it("limits sendMany concurrency and spaces launches", async () => {
    const events: string[] = [];
    let active = 0;
    let maxActive = 0;
    const releaseFirst = Promise.withResolvers<void>();
    const releaseSecond = Promise.withResolvers<void>();
    const releases = [releaseFirst.promise, releaseSecond.promise];
    const base = new TrackingTransport(async (_message, index) => {
      active++;
      maxActive = Math.max(maxActive, active);
      events.push(`start:${index}`);
      await releases[index];
      active--;
      events.push(`finish:${index}`);
      return { successful: true, messageId: `message-${index}` };
    });
    const transport = createRetryTransport(base, {
      maxAttempts: 1,
      sendMany: {
        maxConcurrent: 2,
        intervalMilliseconds: 25,
      },
      wait: (context) => {
        events.push(`wait:${context.delayMilliseconds}`);
        return Promise.resolve();
      },
    });

    const receiptsPromise = collect(transport.sendMany([
      message("First"),
      message("Second"),
    ]));

    releaseSecond.resolve();
    await waitFor(() => events.includes("finish:1"));
    assert.deepEqual(events, ["start:0", "wait:25", "start:1", "finish:1"]);

    releaseFirst.resolve();

    const receipts = await receiptsPromise;

    assert.deepEqual(events, [
      "start:0",
      "wait:25",
      "start:1",
      "finish:1",
      "finish:0",
    ]);
    assert.equal(maxActive, 2);
    assert.deepEqual(
      receipts.map((receipt) => receipt.successful && receipt.messageId),
      ["message-0", "message-1"],
    );
  });

  it("refills sendMany concurrency when later messages finish first", async () => {
    const events: string[] = [];
    const releaseFirst = Promise.withResolvers<void>();
    const base = new TrackingTransport(async (_message, index) => {
      events.push(`start:${index}`);
      if (index === 0) await releaseFirst.promise;
      events.push(`finish:${index}`);
      return { successful: true, messageId: `message-${index}` };
    });
    const transport = createRetryTransport(base, {
      maxAttempts: 1,
      sendMany: { maxConcurrent: 2 },
    });

    const receiptsPromise = collect(transport.sendMany([
      message("First"),
      message("Second"),
      message("Third"),
    ]));

    await waitFor(() => events.includes("finish:1"));
    await waitFor(() => events.includes("start:2"));
    assert.deepEqual(events, [
      "start:0",
      "start:1",
      "finish:1",
      "start:2",
      "finish:2",
    ]);

    releaseFirst.resolve();

    const receipts = await receiptsPromise;

    assert.deepEqual(
      receipts.map((receipt) => receipt.successful && receipt.messageId),
      ["message-0", "message-1", "message-2"],
    );
  });

  it("keeps later sendMany thrown failures ordered", async () => {
    const releaseFirst = Promise.withResolvers<void>();
    const base = new TrackingTransport(async (_message, index) => {
      if (index === 1) throw createAbortError();
      await releaseFirst.promise;
      return { successful: true, messageId: "first" };
    });
    const transport = createRetryTransport(base, {
      maxAttempts: 1,
      sendMany: { maxConcurrent: 2 },
    });

    const receipts = transport.sendMany([
      message("First"),
      message("Second"),
    ]);
    const iterator = receipts[Symbol.asyncIterator]();

    await Promise.resolve();
    releaseFirst.resolve();

    const first = await iterator.next();
    assert.equal(first.done, false);
    assert.equal(first.value.successful, true);
    if (first.value.successful) {
      assert.equal(first.value.messageId, "first");
    }

    const second = await iterator.next();
    assert.equal(second.done, false);
    assert.equal(second.value.successful, false);
    if (!second.value.successful) {
      assert.deepEqual(second.value.errorMessages, [
        "The operation was aborted.",
      ]);
      assert.equal(second.value.attempts, 1);
    }
  });

  it("closes sendMany input iterators when consumers stop early", async () => {
    let closed = false;
    async function* messages(): AsyncIterable<Message> {
      try {
        yield message("First");
        yield message("Second");
      } finally {
        closed = true;
      }
    }
    const base = new SequenceTransport([
      { successful: true, messageId: "first" },
      { successful: true, messageId: "second" },
    ]);
    const transport = createRetryTransport(base, {
      maxAttempts: 1,
      sendMany: { maxConcurrent: 1 },
    });

    for await (const receipt of transport.sendMany(messages())) {
      assert.equal(receipt.successful, true);
      break;
    }

    assert.equal(closed, true);
  });

  it("disposes wrapped async disposable transports", async () => {
    const base = new DisposableTransport({ asyncDisposable: true });
    const transport = createRetryTransport(base);

    await transport[Symbol.asyncDispose]();

    assert.equal(base.asyncDisposed, true);
    assert.equal(base.disposed, false);
  });

  it("disposes wrapped sync disposable transports", async () => {
    const base = new DisposableTransport({ disposable: true });
    const transport = createRetryTransport(base);

    await transport[Symbol.asyncDispose]();

    assert.equal(base.asyncDisposed, false);
    assert.equal(base.disposed, true);
  });

  it("prefers wrapped async disposal when both forms are available", async () => {
    const base = new DisposableTransport({
      asyncDisposable: true,
      disposable: true,
    });
    const transport = createRetryTransport(base);

    await transport[Symbol.asyncDispose]();

    assert.equal(base.asyncDisposed, true);
    assert.equal(base.disposed, false);
  });
});

function message(subject = "Hello"): Message {
  return createMessage({
    from: "sender@example.com",
    to: "recipient@example.com",
    subject,
    content: { text: "Hello" },
  });
}

async function collect<T>(values: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const value of values) result.push(value);
  return result;
}

async function waitFor(predicate: () => boolean): Promise<void> {
  while (!predicate()) {
    await Promise.resolve();
  }
}

function createAbortError(
  message = "The operation was aborted.",
): DOMException {
  return new DOMException(message, "AbortError");
}

type SequenceResult =
  | Receipt<"base">
  | Error
  | ((message: Message, options?: TransportOptions) => Receipt<"base">);

class SequenceTransport implements Transport<"base"> {
  readonly id = "base";
  calls = 0;

  constructor(readonly results: readonly SequenceResult[]) {
  }

  send(
    message: Message,
    options?: TransportOptions,
  ): Promise<Receipt<"base">> {
    options?.signal?.throwIfAborted();
    const result = this.results[this.calls++];
    if (result instanceof Error) return Promise.reject(result);
    if (typeof result === "function") return Promise.resolve(result(message));
    if (result == null) {
      return Promise.resolve({ successful: true, messageId: "fallback" });
    }
    return Promise.resolve(result);
  }

  async *sendMany(
    messages: Iterable<Message> | AsyncIterable<Message>,
    options?: TransportOptions,
  ): AsyncIterable<Receipt<"base">> {
    for await (const item of messages) {
      yield await this.send(item, options);
    }
  }
}

class TrackingTransport implements Transport<"base"> {
  readonly id = "base";
  private calls = 0;

  constructor(
    private readonly handler: (
      message: Message,
      index: number,
      options?: TransportOptions,
    ) => Promise<Receipt<"base">>,
  ) {
  }

  send(
    message: Message,
    options?: TransportOptions,
  ): Promise<Receipt<"base">> {
    const index = this.calls++;
    return this.handler(message, index, options);
  }

  async *sendMany(
    messages: Iterable<Message> | AsyncIterable<Message>,
    options?: TransportOptions,
  ): AsyncIterable<Receipt<"base">> {
    for await (const item of messages) {
      yield await this.send(item, options);
    }
  }
}

class DisposableTransport implements Transport<"base"> {
  readonly id = "base";
  asyncDisposed = false;
  disposed = false;

  constructor(
    private readonly options: {
      readonly asyncDisposable?: boolean;
      readonly disposable?: boolean;
    },
  ) {
    if (options.asyncDisposable) {
      Object.defineProperty(this, Symbol.asyncDispose, {
        value: () => {
          this.asyncDisposed = true;
          return Promise.resolve();
        },
      });
    }
    if (options.disposable) {
      Object.defineProperty(this, Symbol.dispose, {
        value: () => {
          this.disposed = true;
        },
      });
    }
  }

  send(
    _message: Message,
    _options?: TransportOptions,
  ): Promise<Receipt<"base">> {
    return Promise.resolve({ successful: true, messageId: "disposed" });
  }

  async *sendMany(
    messages: Iterable<Message> | AsyncIterable<Message>,
    options?: TransportOptions,
  ): AsyncIterable<Receipt<"base">> {
    for await (const item of messages) {
      yield await this.send(item, options);
    }
  }
}

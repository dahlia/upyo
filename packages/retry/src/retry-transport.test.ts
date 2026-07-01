import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createFailedReceipt,
  createMessage,
  createReceiptError,
  type Message,
  type Receipt,
  type ReceiptError,
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
    assert.ok(receipt.successful);
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
    assert.ok(!receipt.successful);
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

  it("ignores invalid Retry-After metadata", async () => {
    const invalidRetryAfterValues = [NaN, -1, Infinity];

    for (const retryAfterMilliseconds of invalidRetryAfterValues) {
      const delays: number[] = [];
      const base = new SequenceTransport([
        createFailedReceipt(createReceiptError("Rate limited", {
          provider: "base",
          statusCode: 429,
          retryAfterMilliseconds,
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

      assert.deepEqual(delays, [100]);
    }
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
    assert.ok(!receipt.successful);
    assert.deepEqual(receipt.errorMessages, ["Connection reset by peer"]);
    assert.ok(receipt.retryable);
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
    assert.ok(receipt.successful);
    assert.equal(receipt.messageId, "delivered");
    assert.equal(receipt.attempts, 2);
  });

  it("retries provider AbortErrors without timeout messages", async () => {
    const base = new SequenceTransport([
      createAbortError(),
      { successful: true, messageId: "delivered" },
    ]);
    const transport = createRetryTransport(base, {
      maxAttempts: 2,
      jitter: false,
      wait: () => Promise.resolve(),
    });

    const receipt = await transport.send(message());

    assert.equal(base.calls, 2);
    assert.ok(receipt.successful);
    assert.equal(receipt.messageId, "delivered");
    assert.equal(receipt.attempts, 2);
  });

  it("preserves retryable metadata for exhausted provider AbortErrors", async () => {
    const base = new SequenceTransport([
      createAbortError(),
      createAbortError(),
    ]);
    const transport = createRetryTransport(base, {
      maxAttempts: 2,
      jitter: false,
      wait: () => Promise.resolve(),
    });

    const receipt = await transport.send(message());

    assert.equal(base.calls, 2);
    assert.ok(!receipt.successful);
    assert.ok(receipt.retryable);
    assert.equal(receipt.errors?.[0]?.category, "timeout");
    assert.equal(receipt.errors?.[0]?.code, "timeout");
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
      shouldRetry: (failure) => {
        if (failure.kind === "error" && failure.error instanceof Error) {
          errors.push(failure.error);
          return failure.error.name === "AbortError";
        }
        return false;
      },
    });

    const receipt = await transport.send(message());

    assert.equal(base.calls, 2);
    assert.ok(receipt.successful);
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

  it("rejects caller aborts after wrapped sends", async () => {
    const controller = new AbortController();
    const reason = new TypeError("Stop after send.");
    const releaseSend = Promise.withResolvers<void>();
    const base = new TrackingTransport(async () => {
      await releaseSend.promise;
      return { successful: true, messageId: "should-not-deliver" };
    });
    const transport = createRetryTransport(base);

    const sending = transport.send(message(), { signal: controller.signal });
    controller.abort(reason);
    releaseSend.resolve();

    await assert.rejects(sending, (error) => error === reason);
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

  it("propagates custom retry wait rejections", async () => {
    const waitError = new TypeError("Retry scheduler failed.");
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
      wait: () => Promise.reject(waitError),
    });

    await assert.rejects(() => transport.send(message()), waitError);
    assert.equal(base.calls, 1);
  });

  it("preserves custom abort reasons during the default retry wait", async () => {
    const controller = new AbortController();
    const reason = new TypeError("Stop retrying.");
    const base = new SequenceTransport([
      createFailedReceipt("Service unavailable", {
        provider: "base",
        statusCode: 503,
      }),
      { successful: true, messageId: "should-not-send" },
    ]);
    const transport = createRetryTransport(base, {
      maxAttempts: 2,
      backoff: { baseDelayMilliseconds: 1_000 },
      jitter: false,
    });

    const sending = transport.send(message(), { signal: controller.signal });
    controller.abort(reason);

    await assert.rejects(sending, reason);
    assert.equal(base.calls, 1);
  });

  it("preserves structured thrown receipt errors", async () => {
    const error = createReceiptError("Rate limited.", {
      provider: "base",
      statusCode: 429,
      retryAfterMilliseconds: 5_000,
      providerDetails: { requestId: "req-1" },
    });
    const delays: number[] = [];
    const base = new SequenceTransport([error, error]);
    const transport = createRetryTransport(base, {
      maxAttempts: 2,
      backoff: { maxDelayMilliseconds: 10_000 },
      jitter: false,
      wait: (context) => {
        delays.push(context.delayMilliseconds);
        return Promise.resolve();
      },
    });

    const receipt = await transport.send(message());

    assert.equal(base.calls, 2);
    assert.deepEqual(delays, [5_000]);
    assert.ok(!receipt.successful);
    assert.deepEqual(receipt.errorMessages, ["Rate limited."]);
    assert.ok(receipt.retryable);
    assert.equal(receipt.provider, "base");
    assert.equal(receipt.attempts, 2);
    assert.deepEqual(receipt.errors, [error]);
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

  it("yields completed sendMany receipts before slow async input", async () => {
    const releaseSecond = Promise.withResolvers<void>();
    async function* messages(): AsyncIterable<Message> {
      yield message("First");
      await releaseSecond.promise;
      yield message("Second");
    }
    const base = new TrackingTransport((_message, index) =>
      Promise.resolve({
        successful: true,
        messageId: `message-${index}`,
      })
    );
    const transport = createRetryTransport(base, {
      maxAttempts: 1,
      sendMany: { maxConcurrent: 2 },
    });

    const iterator = transport.sendMany(messages())[Symbol.asyncIterator]();
    const firstResult = iterator.next();
    const firstSettled = await settlesWithin(firstResult);

    assert.ok(firstSettled);
    const first = await firstResult;
    assert.ok(!first.done);
    assert.ok(first.value.successful);
    if (first.value.successful) {
      assert.equal(first.value.messageId, "message-0");
    }

    releaseSecond.resolve();
    const second = await iterator.next();
    assert.ok(!second.done);
    assert.ok(second.value.successful);
    if (second.value.successful) {
      assert.equal(second.value.messageId, "message-1");
    }
    const done = await iterator.next();
    assert.ok(done.done);
  });

  it("surfaces sendMany input errors after yielding ready receipts", async () => {
    const inputError = new TypeError("Input failed.");
    const releaseFailure = Promise.withResolvers<void>();
    async function* messages(): AsyncIterable<Message> {
      yield message("First");
      await releaseFailure.promise;
      throw inputError;
    }
    const base = new TrackingTransport((_message, index) =>
      Promise.resolve({
        successful: true,
        messageId: `message-${index}`,
      })
    );
    const transport = createRetryTransport(base, {
      maxAttempts: 1,
      sendMany: { maxConcurrent: 2 },
    });

    const iterator = transport.sendMany(messages())[Symbol.asyncIterator]();
    const first = await iterator.next();
    assert.ok(!first.done);
    assert.ok(first.value.successful);
    if (first.value.successful) {
      assert.equal(first.value.messageId, "message-0");
    }

    releaseFailure.resolve();

    await assert.rejects(() => iterator.next(), inputError);
  });

  it("rejects pending sendMany input pulls when aborted", async () => {
    const controller = new AbortController();
    const reason = new TypeError("Stop reading input.");
    const releaseSecond = Promise.withResolvers<void>();
    async function* messages(): AsyncIterable<Message> {
      yield message("First");
      await releaseSecond.promise;
      yield message("Second");
    }
    const base = new TrackingTransport((_message, index) =>
      Promise.resolve({
        successful: true,
        messageId: `message-${index}`,
      })
    );
    const transport = createRetryTransport(base, {
      maxAttempts: 1,
      sendMany: { maxConcurrent: 2 },
    });

    const iterator = transport.sendMany(messages(), {
      signal: controller.signal,
    })[Symbol.asyncIterator]();
    const first = await iterator.next();
    assert.ok(!first.done);
    assert.ok(first.value.successful);

    const next = iterator.next();
    controller.abort(reason);

    await assert.rejects(
      () => Promise.race([next, rejectAfter(50)]),
      (error) => error === reason,
    );
  });

  it("yields queued sendMany receipts before launch errors", async () => {
    const inputError = new TypeError("Input failed.");
    const messages: Iterable<Message> = {
      [Symbol.iterator]() {
        let index = 0;
        return {
          next(): IteratorResult<Message> {
            if (index++ === 0) {
              return { done: false, value: message("First") };
            }
            throw inputError;
          },
        };
      },
    };
    const base = new TrackingTransport((_message, index) =>
      Promise.resolve({
        successful: true,
        messageId: `message-${index}`,
      })
    );
    const transport = createRetryTransport(base, {
      maxAttempts: 1,
      sendMany: { maxConcurrent: 2 },
    });

    const iterator = transport.sendMany(messages)[Symbol.asyncIterator]();
    const first = await iterator.next();
    assert.ok(!first.done);
    assert.ok(first.value.successful);
    if (first.value.successful) {
      assert.equal(first.value.messageId, "message-0");
    }

    await assert.rejects(() => iterator.next(), inputError);
  });

  it("accepts primitive sync iterables in sendMany", async () => {
    let calls = 0;
    const base = new TrackingTransport((_message, index) => {
      calls++;
      return Promise.resolve({
        successful: true,
        messageId: `message-${index}`,
      });
    });
    const transport = createRetryTransport(base, {
      maxAttempts: 1,
      sendMany: { maxConcurrent: 1 },
    });

    const receipts = await collect(
      transport.sendMany("ab" as unknown as Iterable<Message>),
    );

    assert.equal(calls, 2);
    assert.deepEqual(
      receipts.map((receipt) => receipt.successful && receipt.messageId),
      ["message-0", "message-1"],
    );
  });

  it("drains already-launched sendMany receipts before launch errors", async () => {
    const inputError = new TypeError("Input failed.");
    const events: string[] = [];
    const releaseFirst = Promise.withResolvers<void>();
    const messages: Iterable<Message> = {
      [Symbol.iterator]() {
        let index = 0;
        return {
          next(): IteratorResult<Message> {
            if (index < 2) {
              return { done: false, value: message(`Message ${index++}`) };
            }
            events.push("input-error");
            throw inputError;
          },
        };
      },
    };
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

    const iterator = transport.sendMany(messages)[Symbol.asyncIterator]();
    const firstResult = iterator.next();

    await waitFor(() => events.includes("input-error"));
    assert.ok(!await settlesWithin(firstResult));

    releaseFirst.resolve();

    const first = await firstResult;
    assert.ok(!first.done);
    assert.ok(first.value.successful);
    if (first.value.successful) {
      assert.equal(first.value.messageId, "message-0");
    }

    const second = await iterator.next();
    assert.ok(!second.done);
    assert.ok(second.value.successful);
    if (second.value.successful) {
      assert.equal(second.value.messageId, "message-1");
    }

    await assert.rejects(
      () => iterator.next(),
      (error) => error === inputError,
    );
  });

  it("does not hang when closed with a pending sendMany input pull", async () => {
    const never = Promise.withResolvers<void>();
    async function* messages(): AsyncIterable<Message> {
      yield message("First");
      await never.promise;
      yield message("Second");
    }
    const base = new TrackingTransport((_message, index) =>
      Promise.resolve({
        successful: true,
        messageId: `message-${index}`,
      })
    );
    const transport = createRetryTransport(base, {
      maxAttempts: 1,
      sendMany: { maxConcurrent: 2 },
    });

    const iterator = transport.sendMany(messages())[Symbol.asyncIterator]();
    const first = await iterator.next();
    assert.ok(!first.done);
    assert.ok(first.value.successful);

    const returned = iterator.return?.();
    assert.ok(returned != null);
    assert.ok(await settlesWithin(returned, 50));
  });

  it("closes pending sendMany input pulls when consumers stop early", async () => {
    const pendingPullStarted = Promise.withResolvers<void>();
    let closed = false;
    const messages: AsyncIterable<Message> = {
      [Symbol.asyncIterator]() {
        let index = 0;
        return {
          next(): Promise<IteratorResult<Message>> {
            if (index++ === 0) {
              return Promise.resolve({
                done: false,
                value: message("First"),
              });
            }
            pendingPullStarted.resolve();
            return new Promise<IteratorResult<Message>>(() => {});
          },
          return(): Promise<IteratorResult<Message>> {
            closed = true;
            return Promise.resolve({ done: true, value: undefined });
          },
        };
      },
    };
    const base = new TrackingTransport((_message, index) =>
      Promise.resolve({
        successful: true,
        messageId: `message-${index}`,
      })
    );
    const transport = createRetryTransport(base, {
      maxAttempts: 1,
      sendMany: { maxConcurrent: 2 },
    });

    const iterator = transport.sendMany(messages)[Symbol.asyncIterator]();
    const first = await iterator.next();
    assert.ok(!first.done);
    assert.ok(first.value.successful);
    await pendingPullStarted.promise;

    const returned = iterator.return?.();
    assert.ok(returned != null);
    assert.ok(await settlesWithin(returned, 50));
    await returned;
    await waitFor(() => closed);

    assert.ok(closed);
  });

  it("yields completed sendMany receipts while throttling launches", async () => {
    const releaseThrottle = Promise.withResolvers<void>();
    const base = new TrackingTransport((_message, index) =>
      Promise.resolve({
        successful: true,
        messageId: `message-${index}`,
      })
    );
    const transport = createRetryTransport(base, {
      maxAttempts: 1,
      sendMany: { maxConcurrent: 2, intervalMilliseconds: 1_000 },
      wait: (context) => {
        if (context.reason === "sendMany-throttle") {
          return releaseThrottle.promise;
        }
        return Promise.resolve();
      },
    });

    const iterator = transport.sendMany([
      message("First"),
      message("Second"),
    ])[Symbol.asyncIterator]();
    const firstResult = iterator.next();
    const firstSettled = await settlesWithin(firstResult);

    assert.ok(firstSettled);
    const first = await firstResult;
    assert.ok(!first.done);
    assert.ok(first.value.successful);
    if (first.value.successful) {
      assert.equal(first.value.messageId, "message-0");
    }

    releaseThrottle.resolve();
    const second = await iterator.next();
    assert.ok(!second.done);
    assert.ok(second.value.successful);
    if (second.value.successful) {
      assert.equal(second.value.messageId, "message-1");
    }
    const done = await iterator.next();
    assert.ok(done.done);
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

  it("stops launching sendMany messages after queued send failures", async () => {
    const sendError = new TypeError("Retry policy failed.");
    const releaseFirst = Promise.withResolvers<void>();
    const events: string[] = [];
    const base = new TrackingTransport(async (_message, index) => {
      events.push(`start:${index}`);
      if (index === 0) {
        await releaseFirst.promise;
        return { successful: true, messageId: "first" };
      }
      return createFailedReceipt("Service unavailable.", {
        provider: "base",
        retryable: true,
      });
    });
    const transport = createRetryTransport(base, {
      maxAttempts: 2,
      sendMany: { maxConcurrent: 2 },
      wait: () => Promise.reject(sendError),
    });

    const iterator = transport.sendMany([
      message("First"),
      message("Second"),
      message("Third"),
    ])[Symbol.asyncIterator]();
    const firstResult = iterator.next();

    await waitFor(() => events.includes("start:1"));
    await Promise.resolve();
    assert.deepEqual(events, ["start:0", "start:1"]);

    releaseFirst.resolve();
    const first = await firstResult;
    assert.ok(!first.done);
    assert.ok(first.value.successful);
    await assert.rejects(
      () => iterator.next(),
      (error) => error === sendError,
    );
    assert.deepEqual(events, ["start:0", "start:1"]);
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
    assert.ok(!first.done);
    assert.ok(first.value.successful);
    if (first.value.successful) {
      assert.equal(first.value.messageId, "first");
    }

    const second = await iterator.next();
    assert.ok(!second.done);
    assert.ok(!second.value.successful);
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
      assert.ok(receipt.successful);
      break;
    }

    await waitFor(() => closed);
    assert.ok(closed);
  });

  it("cancels pending sendMany launch waits when consumers stop early", async () => {
    const events: string[] = [];
    const releaseFirst = Promise.withResolvers<void>();
    let waitStarted = false;
    let waitAborted = false;
    const base = new TrackingTransport(async (_message, index) => {
      events.push(`start:${index}`);
      if (index === 0) await releaseFirst.promise;
      return {
        successful: true,
        messageId: `message-${index}`,
      };
    });
    const transport = createRetryTransport(base, {
      maxAttempts: 1,
      sendMany: { maxConcurrent: 2, intervalMilliseconds: 1_000 },
      wait: (_context, signal) => {
        waitStarted = true;
        return new Promise<void>((_resolve, reject) => {
          signal?.addEventListener("abort", () => {
            waitAborted = true;
            reject(signal.reason);
          }, { once: true });
        });
      },
    });

    const iterator = transport.sendMany([
      message("First"),
      message("Second"),
    ])[Symbol.asyncIterator]();
    const firstResult = iterator.next();
    await waitFor(() => waitStarted);
    releaseFirst.resolve();

    const first = await firstResult;
    assert.ok(!first.done);
    assert.ok(waitStarted);

    await iterator.return?.();

    await waitFor(() => waitAborted);
    assert.deepEqual(events, ["start:0"]);
  });

  it("disposes wrapped async disposable transports", async () => {
    const base = new DisposableTransport({ asyncDisposable: true });
    const transport = createRetryTransport(base);

    await transport[Symbol.asyncDispose]();

    assert.ok(base.asyncDisposed);
    assert.ok(!base.disposed);
  });

  it("disposes wrapped sync disposable transports", async () => {
    const base = new DisposableTransport({ disposable: true });
    const transport = createRetryTransport(base);

    await transport[Symbol.asyncDispose]();

    assert.ok(!base.asyncDisposed);
    assert.ok(base.disposed);
  });

  it("prefers wrapped async disposal when both forms are available", async () => {
    const base = new DisposableTransport({
      asyncDisposable: true,
      disposable: true,
    });
    const transport = createRetryTransport(base);

    await transport[Symbol.asyncDispose]();

    assert.ok(base.asyncDisposed);
    assert.ok(!base.disposed);
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
  const deadline = Date.now() + 1_000;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      assert.fail("Timed out waiting for condition.");
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

async function settlesWithin<T>(
  promise: Promise<T>,
  milliseconds = 10,
): Promise<boolean> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise.then(() => true, () => true),
      new Promise<boolean>((resolve) => {
        timeout = setTimeout(() => resolve(false), milliseconds);
      }),
    ]);
  } finally {
    if (timeout != null) clearTimeout(timeout);
  }
}

function rejectAfter(milliseconds: number): Promise<never> {
  return new Promise((_resolve, reject) => {
    setTimeout(
      () => reject(new Error("Timed out waiting for rejection.")),
      milliseconds,
    );
  });
}

function createAbortError(
  message = "The operation was aborted.",
): DOMException {
  return new DOMException(message, "AbortError");
}

type SequenceResult =
  | Receipt<"base">
  | ReceiptError<"base">
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
    if (isReceiptError(result)) return Promise.reject(result);
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

function isReceiptError(value: unknown): value is ReceiptError<"base"> {
  return typeof value === "object" && value != null && "category" in value &&
    "retryable" in value && "message" in value;
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

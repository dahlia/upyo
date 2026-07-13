import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { configure, reset } from "@logtape/logtape";
import { createLogRecorder, type LogRecorder } from "@logtape/testing";
import {
  createFailedReceipt,
  createMessage,
  type Message,
  type Receipt,
  type Transport,
  type TransportOptions,
} from "@upyo/core";
import { LogTapeTransport } from "./logtape-transport.ts";

const message = createMessage({
  from: "sender@example.com",
  to: ["first@example.net", "second@example.net"],
  cc: "copy@example.net",
  bcc: "blind-copy@example.net",
  subject: "Test message",
  content: { text: "Hello from Upyo." },
  priority: "high",
  attachments: [
    {
      inline: false,
      filename: "hello.txt",
      contentType: "text/plain",
      content: new TextEncoder().encode("Hello."),
      contentId: "hello@example.com",
    },
  ],
});
let recorderSequence: Promise<void> = Promise.resolve();

const createProviderSpecificTransportWithoutWrapper = () => {
  // @ts-expect-error A provider-specific type requires a wrapped transport.
  return new LogTapeTransport<"base">();
};
void createProviderSpecificTransportWithoutWrapper;

describe("LogTapeTransport", { concurrency: 1 }, () => {
  it("logs standalone sends and returns a synthetic receipt", async () => {
    await withRecorder(async (recorder) => {
      const transport = new LogTapeTransport();
      const typedTransport: Transport<"logtape"> = transport;

      const receipt = await typedTransport.send(message);

      assert.ok(receipt.successful);
      assert.match(receipt.messageId, /^logtape-[0-9a-f-]+$/);
      assert.equal(receipt.provider, "logtape");
      assert.equal(receipt.attempts, 1);
      assert.ok(receipt.timestamp != null);
      assert.equal(transport.id, "logtape");
      assert.equal(recorder.records.length, 2);
      recorder.assertLogged({
        category: ["upyo"],
        level: "debug",
        message: "Sending email.",
        properties: {
          event: "email.sending",
          operation: "send",
          transportId: "logtape",
          recipientCount: 2,
          ccRecipientCount: 1,
          bccRecipientCount: 1,
          attachmentCount: 1,
          priority: "high",
        },
      });
      recorder.assertLogged({
        category: ["upyo"],
        level: "info",
        message: "Email sent.",
        properties: {
          event: "email.sent",
          operation: "send",
          transportId: "logtape",
          messageId: receipt.messageId,
          provider: "logtape",
        },
      });
      assert.ok(
        recorder.records.every((record) => !("message" in record.properties)),
      );
    });
  });

  it("supports custom categories, levels, and full message recording", async () => {
    await withRecorder(async (recorder) => {
      const transport = new LogTapeTransport({
        category: ["application", "mail"],
        recordMessage: true,
        levels: {
          sending: "trace",
          sent: "warning",
          failed: "fatal",
        },
      });

      await transport.send(message);

      recorder.assertLogged({
        category: ["application", "mail"],
        level: "trace",
        properties: { event: "email.sending", message },
      });
      recorder.assertLogged({
        category: ["application", "mail"],
        level: "warning",
        properties: { event: "email.sent", message },
      });
    });
  });

  it("decorates a transport without changing successful receipts", async () => {
    await withRecorder(async (recorder) => {
      const base = new RecordingTransport();
      const transport = new LogTapeTransport({ transport: base });
      const typedTransport: Transport<"base"> = transport;
      const controller = new AbortController();

      const receipt = await typedTransport.send(message, {
        signal: controller.signal,
      });

      assert.deepEqual(receipt, {
        successful: true,
        messageId: "base-message-1",
        provider: "base",
      });
      assert.equal(transport.id, "base");
      assert.deepEqual(base.sentMessages, [message]);
      assert.equal(base.lastOptions?.signal, controller.signal);
      recorder.assertLogged({
        level: "info",
        properties: {
          event: "email.sent",
          transportId: "base",
          messageId: "base-message-1",
          provider: "base",
        },
      });
    });
  });

  it("logs and preserves failed receipts", async () => {
    await withRecorder(async (recorder) => {
      const base = new RecordingTransport();
      base.nextReceipt = createFailedReceipt("Provider rejected the message.", {
        provider: "base",
        category: "rejected",
        code: "base.rejected",
        retryable: false,
      });
      const transport = new LogTapeTransport({
        transport: base,
        levels: { failed: "fatal" },
      });

      const receipt = await transport.send(message);

      assert.ok(!receipt.successful);
      assert.deepEqual(receipt.errorMessages, [
        "Provider rejected the message.",
      ]);
      recorder.assertLogged({
        level: "fatal",
        message: "Failed to send email.",
        properties: {
          event: "email.failed",
          operation: "send",
          transportId: "base",
          errorMessages: receipt.errorMessages,
          retryable: false,
          provider: "base",
        },
      });
    });
  });

  it("logs thrown errors and rethrows the original value", async () => {
    await withRecorder(async (recorder) => {
      const base = new RecordingTransport();
      const error = new TypeError("Transport failed.");
      base.throwError = error;
      const transport = new LogTapeTransport({ transport: base });

      let thrown: unknown;
      try {
        await transport.send(message);
      } catch (caught) {
        thrown = caught;
      }

      assert.equal(thrown, error);
      recorder.assertLogged({
        level: "error",
        message: /Failed to send email/,
        properties: {
          event: "email.failed",
          operation: "send",
          transportId: "base",
          error,
        },
      });
    });
  });

  it("delegates sendMany while logging each message and receipt", async () => {
    await withRecorder(async (recorder) => {
      const base = new RecordingTransport();
      const transport = new LogTapeTransport({ transport: base });
      const secondMessage = createMessage({
        from: "sender@example.com",
        to: "third@example.net",
        subject: "Second message",
        content: { text: "Another message." },
      });
      async function* messages(): AsyncIterable<Message> {
        yield message;
        yield secondMessage;
      }

      const receipts: Receipt<"base">[] = [];
      for await (const receipt of transport.sendMany(messages())) {
        receipts.push(receipt);
      }

      assert.equal(base.sendManyCalls, 1);
      assert.equal(base.sendCalls, 0);
      assert.deepEqual(base.sentMessages, [message, secondMessage]);
      assert.deepEqual(
        receipts.map((receipt) => receipt.successful && receipt.messageId),
        ["base-batch-1", "base-batch-2"],
      );
      assert.equal(
        recorder.filter({ properties: { event: "email.sending" } }).length,
        2,
      );
      assert.equal(
        recorder.filter({ properties: { event: "email.sent" } }).length,
        2,
      );
      assert.ok(
        recorder.records.every(
          (record) => record.properties.operation === "sendMany",
        ),
      );
    });
  });

  it("closes buffered receipts when the sendMany consumer stops early", async () => {
    await withRecorder(async (recorder) => {
      const secondMessage = createMessage({
        from: "sender@example.com",
        to: "third@example.net",
        subject: "Second message",
        content: { text: "Another message." },
      });
      const base = new BufferedTransport();
      const transport = new LogTapeTransport({ transport: base });

      for await (
        const _receipt of transport.sendMany([message, secondMessage])
      ) {
        break;
      }

      assert.deepEqual(base.sentMessages, [message, secondMessage]);
      assert.equal(base.yieldedReceiptCount, 1);
      assert.equal(
        recorder.filter({ properties: { event: "email.sent" } }).length,
        1,
      );
    });
  });

  it("does not send more messages when a sequential consumer stops early", async () => {
    await withRecorder(async (recorder) => {
      const secondMessage = createMessage({
        from: "sender@example.com",
        to: "third@example.net",
        subject: "Second message",
        content: { text: "Another message." },
      });
      const base = new RecordingTransport();
      const transport = new LogTapeTransport({ transport: base });

      for await (
        const _receipt of transport.sendMany([message, secondMessage])
      ) {
        break;
      }

      assert.deepEqual(base.sentMessages, [message]);
      assert.equal(
        recorder.filter({ properties: { event: "email.sent" } }).length,
        1,
      );
    });
  });

  it("does not advance a prefetched batch after its consumer stops", async () => {
    await withRecorder(async () => {
      const secondMessage = createMessage({
        from: "sender@example.com",
        to: "third@example.net",
        subject: "Second message",
        content: { text: "Another message." },
      });
      const thirdMessage = createMessage({
        from: "sender@example.com",
        to: "fourth@example.net",
        subject: "Third message",
        content: { text: "One more message." },
      });
      const base = new PrefetchingTransport();
      const transport = new LogTapeTransport({ transport: base });

      for await (
        const _receipt of transport.sendMany([
          message,
          secondMessage,
          thirdMessage,
        ])
      ) {
        break;
      }

      assert.deepEqual(base.sentMessages, [message, secondMessage]);
      assert.ok(base.closed);
    });
  });

  it("logs every pending message when sendMany throws", async () => {
    await withRecorder(async (recorder) => {
      const secondMessage = createMessage({
        from: "sender@example.com",
        to: "third@example.net",
        subject: "Second message",
        content: { text: "Another message." },
      });
      const error = new TypeError("Batch transport failed.");
      const base = new ConsumingThenThrowingTransport(error);
      const transport = new LogTapeTransport({
        transport: base,
        recordMessage: true,
      });

      let thrown: unknown;
      try {
        for await (
          const _receipt of transport.sendMany([
            message,
            secondMessage,
          ])
        ) {
          // The wrapped transport throws before yielding a receipt.
        }
      } catch (caught) {
        thrown = caught;
      }

      assert.equal(thrown, error);
      assert.deepEqual(base.sentMessages, [message, secondMessage]);
      const failures = recorder.filter({
        properties: { event: "email.failed" },
      });
      assert.equal(failures.length, 2);
      assert.deepEqual(
        failures.map((record) => record.properties.message),
        [message, secondMessage],
      );
      assert.deepEqual(
        failures.map((record) => record.properties.recipientCount),
        [2, 1],
      );
      assert.ok(
        failures.every((record) => record.properties.error === error),
      );
    });
  });

  it("handles synchronous sendMany input in log-only mode", async () => {
    await withRecorder(async (recorder) => {
      const transport = new LogTapeTransport();
      const secondMessage = createMessage({
        from: "sender@example.com",
        to: "third@example.net",
        subject: "Second message",
        content: { text: "Another message." },
      });

      const receipts: Receipt<"logtape">[] = [];
      for await (
        const receipt of transport.sendMany([message, secondMessage])
      ) {
        receipts.push(receipt);
      }

      assert.equal(receipts.length, 2);
      assert.ok(receipts.every((receipt) => receipt.successful));
      assert.notEqual(
        receipts[0].successful && receipts[0].messageId,
        receipts[1].successful && receipts[1].messageId,
      );
      assert.equal(
        recorder.filter({ properties: { operation: "sendMany" } }).length,
        4,
      );
    });
  });

  it("rejects an already aborted standalone send without logging", async () => {
    await withRecorder(async (recorder) => {
      const controller = new AbortController();
      controller.abort();
      const transport = new LogTapeTransport();

      await assert.rejects(
        () => transport.send(message, { signal: controller.signal }),
        { name: "AbortError" },
      );
      assert.equal(recorder.records.length, 0);
    });
  });

  it("disposes an asynchronous wrapped transport", async () => {
    const base = new AsyncDisposableTransport();
    const transport = new LogTapeTransport({ transport: base });

    await transport[Symbol.asyncDispose]();

    assert.ok(base.disposed);
  });

  it("falls back to disposing a synchronous wrapped transport", async () => {
    const base = new DisposableTransport();
    const transport = new LogTapeTransport({ transport: base });

    await transport[Symbol.asyncDispose]();

    assert.ok(base.disposed);
  });
});

async function withRecorder(
  run: (recorder: LogRecorder) => Promise<void>,
): Promise<void> {
  const execution = recorderSequence.then(() => runWithRecorder(run));
  recorderSequence = execution.catch(() => undefined);
  return await execution;
}

async function runWithRecorder(
  run: (recorder: LogRecorder) => Promise<void>,
): Promise<void> {
  const recorder = createLogRecorder();
  try {
    await configure({
      sinks: { recorder: recorder.sink },
      loggers: [
        { category: [], lowestLevel: "trace", sinks: ["recorder"] },
        {
          category: ["logtape", "meta"],
          sinks: [],
          parentSinks: "override",
        },
      ],
    });
    await run(recorder);
  } finally {
    await reset();
  }
}

class RecordingTransport implements Transport<"base"> {
  readonly id = "base";
  readonly sentMessages: Message[] = [];
  sendCalls = 0;
  sendManyCalls = 0;
  lastOptions?: TransportOptions;
  nextReceipt: Receipt<"base"> = {
    successful: true,
    messageId: "base-message-1",
    provider: "base",
  };
  throwError?: unknown;

  send(
    message: Message,
    options?: TransportOptions,
  ): Promise<Receipt<"base">> {
    this.sendCalls++;
    this.sentMessages.push(message);
    this.lastOptions = options;
    if (this.throwError != null) return Promise.reject(this.throwError);
    return Promise.resolve(this.nextReceipt);
  }

  async *sendMany(
    messages: Iterable<Message> | AsyncIterable<Message>,
    options?: TransportOptions,
  ): AsyncIterable<Receipt<"base">> {
    this.sendManyCalls++;
    this.lastOptions = options;
    let index = 0;
    for await (const message of messages) {
      this.sentMessages.push(message);
      if (this.throwError != null) throw this.throwError;
      yield {
        successful: true,
        messageId: `base-batch-${++index}`,
        provider: "base",
      };
    }
  }
}

class AsyncDisposableTransport extends RecordingTransport
  implements AsyncDisposable {
  disposed = false;

  [Symbol.asyncDispose](): Promise<void> {
    this.disposed = true;
    return Promise.resolve();
  }
}

class DisposableTransport extends RecordingTransport implements Disposable {
  disposed = false;

  [Symbol.dispose](): void {
    this.disposed = true;
  }
}

class ConsumingThenThrowingTransport implements Transport<"base"> {
  readonly id = "base";
  readonly sentMessages: Message[] = [];

  constructor(readonly error: unknown) {}

  send(): Promise<Receipt<"base">> {
    return Promise.reject(this.error);
  }

  async *sendMany(
    messages: Iterable<Message> | AsyncIterable<Message>,
  ): AsyncIterable<Receipt<"base">> {
    for await (const message of messages) {
      this.sentMessages.push(message);
    }
    yield* [] as Receipt<"base">[];
    throw this.error;
  }
}

class BufferedTransport implements Transport<"base"> {
  readonly id = "base";
  readonly sentMessages: Message[] = [];
  yieldedReceiptCount = 0;

  send(): Promise<Receipt<"base">> {
    return Promise.reject(new TypeError("Use sendMany()."));
  }

  async *sendMany(
    messages: Iterable<Message> | AsyncIterable<Message>,
  ): AsyncIterable<Receipt<"base">> {
    for await (const message of messages) {
      this.sentMessages.push(message);
    }
    for (let index = 0; index < this.sentMessages.length; index++) {
      this.yieldedReceiptCount++;
      yield {
        successful: true,
        messageId: `base-buffered-${index + 1}`,
        provider: "base",
      };
    }
  }
}

class PrefetchingTransport implements Transport<"base"> {
  readonly id = "base";
  readonly sentMessages: Message[] = [];
  closed = false;

  send(): Promise<Receipt<"base">> {
    return Promise.reject(new TypeError("Use sendMany()."));
  }

  async *sendMany(
    messages: Iterable<Message> | AsyncIterable<Message>,
  ): AsyncIterable<Receipt<"base">> {
    try {
      const iterator = Symbol.asyncIterator in messages
        ? messages[Symbol.asyncIterator]()
        : messages[Symbol.iterator]();
      const first = await iterator.next();
      const second = await iterator.next();
      if (first.done || second.done) return;
      this.sentMessages.push(first.value, second.value);

      yield {
        successful: true,
        messageId: "base-prefetched-1",
        provider: "base",
      };

      const third = await iterator.next();
      if (!third.done) this.sentMessages.push(third.value);
      yield {
        successful: true,
        messageId: "base-prefetched-2",
        provider: "base",
      };
    } finally {
      this.closed = true;
    }
  }
}

import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { describe, it } from "node:test";
import {
  type AttachmentContentFactory,
  iterateAttachmentContent,
  readAttachmentContent,
} from "./attachment.ts";

describe("attachment content", () => {
  it("does not return bytes when cancellation wins before the await resumes", async () => {
    const controller = new AbortController();
    let finish!: (value: Uint8Array) => void;
    const input = new Promise<Uint8Array>((resolve) => finish = resolve);
    const pending = readAttachmentContent(input, controller.signal);
    await Promise.resolve();
    finish(new Uint8Array([1]));
    queueMicrotask(() => controller.abort(new TypeError("Canceled.")));
    await assert.rejects(
      pending,
      (error) => error === controller.signal.reason,
    );
  });
  it("copies reusable Buffer chunks rather than retaining their slice views", async () => {
    const bytes = Buffer.from([1]);
    const collected = await readAttachmentContent(async function* () {
      yield bytes;
      bytes[0] = 2;
      yield bytes;
    });
    assert.deepEqual(collected, new Uint8Array([1, 2]));
  });
  it("retains byte array identity and reads blobs", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    assert.equal(await readAttachmentContent(bytes), bytes);
    assert.equal(await readAttachmentContent(Promise.resolve(bytes)), bytes);
    assert.deepEqual(await readAttachmentContent(new Blob([bytes])), bytes);
  });

  it("reopens factories and copies chunks before the producer reuses them", async () => {
    let calls = 0;
    const source: AttachmentContentFactory = async function* () {
      calls++;
      const buffer = new Uint8Array([1]);
      yield buffer;
      buffer[0] = 2;
      yield buffer;
    };
    assert.deepEqual(
      await readAttachmentContent(source),
      new Uint8Array([1, 2]),
    );
    assert.deepEqual(
      await readAttachmentContent(source),
      new Uint8Array([1, 2]),
    );
    assert.equal(calls, 2);
  });

  it("requests return immediately when an outstanding next is aborted", async () => {
    const controller = new AbortController();
    let returns = 0;
    let sourceSignal: AbortSignal | undefined;
    const source: AttachmentContentFactory = (signal) => {
      sourceSignal = signal;
      return {
        [Symbol.asyncIterator]() {
          return {
            next: () => new Promise(() => {}),
            return: () => {
              returns++;
              return new Promise(() => {});
            },
          };
        },
      };
    };
    const pending = readAttachmentContent(source, controller.signal);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const reason = new TypeError("Canceled.");
    controller.abort(reason);
    await assert.rejects(pending, (error) => error === reason);
    assert.ok(sourceSignal?.aborted);
    assert.equal(returns, 1);
  });

  it("closes a late factory result without pulling it", async () => {
    const controller = new AbortController();
    let resolve!: (value: AsyncIterable<Uint8Array>) => void;
    let returns = 0;
    const pending = readAttachmentContent(
      () => new Promise((done) => resolve = done),
      controller.signal,
    );
    await Promise.resolve();
    controller.abort();
    await assert.rejects(pending);
    resolve({
      [Symbol.asyncIterator]() {
        return {
          next() {
            assert.fail("A canceled factory must not be pulled.");
          },
          return() {
            returns++;
            return Promise.resolve({ done: true, value: undefined });
          },
        };
      },
    });
    await new Promise((done) => setTimeout(done, 0));
    assert.equal(returns, 1);
  });

  it("aborts the source and closes it on early consumer exit", async () => {
    let closed = false;
    let sourceSignal: AbortSignal | undefined;
    for await (
      const chunk of iterateAttachmentContent(async function* (signal) {
        sourceSignal = signal;
        try {
          yield new Uint8Array([1]);
          assert.fail("Unexpected read ahead.");
        } finally {
          closed = true;
        }
      })
    ) {
      assert.equal(chunk[0], 1);
      break;
    }
    assert.ok(closed);
    assert.ok(sourceSignal?.aborted);
  });

  it("allows timers to cancel an endless stream of empty chunks", async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10);
    try {
      await assert.rejects(readAttachmentContent(async function* () {
        while (true) yield new Uint8Array();
      }, controller.signal));
    } finally {
      clearTimeout(timer);
    }
  });
});

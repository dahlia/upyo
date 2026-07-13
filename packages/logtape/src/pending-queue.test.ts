import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { PendingQueue } from "./pending-queue.ts";

describe("PendingQueue", () => {
  it("dequeues values in constant-time FIFO order", () => {
    const queue = new PendingQueue<number>();

    for (let value = 0; value < 10_000; value++) {
      queue.enqueue(value);
    }

    for (let value = 0; value < 10_000; value++) {
      assert.equal(queue.dequeue(), value);
    }
    assert.equal(queue.size, 0);
    assert.equal(queue.dequeue(), undefined);
  });

  it("iterates only values that have not been dequeued", () => {
    const queue = new PendingQueue<string>();
    queue.enqueue("first");
    queue.enqueue("second");
    queue.enqueue("third");

    assert.equal(queue.dequeue(), "first");
    assert.deepEqual([...queue], ["second", "third"]);
    assert.equal(queue.size, 2);
  });
});

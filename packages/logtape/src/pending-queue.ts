interface QueueNode<T> {
  readonly value: T;
  next?: QueueNode<T>;
}

/**
 * Internal linked FIFO queue for messages awaiting delivery receipts.
 *
 * Both enqueue and dequeue operations take constant time, without retaining
 * references to values that have already been dequeued.
 *
 * @typeParam T The queued value type.
 * @since 0.6.0
 */
export class PendingQueue<T> implements Iterable<T> {
  private head?: QueueNode<T>;
  private tail?: QueueNode<T>;
  private valueCount = 0;

  /** Number of values waiting in the queue. */
  get size(): number {
    return this.valueCount;
  }

  /**
   * Adds a value to the end of the queue.
   *
   * @param value The value to enqueue.
   */
  enqueue(value: T): void {
    const node: QueueNode<T> = { value };
    if (this.tail == null) {
      this.head = node;
    } else {
      this.tail.next = node;
    }
    this.tail = node;
    this.valueCount++;
  }

  /**
   * Removes and returns the value at the front of the queue.
   *
   * @returns The first queued value, or `undefined` when the queue is empty.
   */
  dequeue(): T | undefined {
    const node = this.head;
    if (node == null) return undefined;

    this.head = node.next;
    node.next = undefined;
    this.valueCount--;
    if (this.head == null) this.tail = undefined;
    return node.value;
  }

  /** Iterates over queued values without removing them. */
  *[Symbol.iterator](): Iterator<T> {
    let node = this.head;
    while (node != null) {
      yield node.value;
      node = node.next;
    }
  }
}

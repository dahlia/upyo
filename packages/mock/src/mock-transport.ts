import type { Message, Receipt, Transport, TransportOptions } from "@upyo/core";
import {
  createMockConfig,
  type MockConfig,
  type ResolvedMockConfig,
} from "./config.ts";

/**
 * A mock transport implementation for testing purposes.
 *
 * This transport doesn't actually send emails but stores them in memory,
 * making it useful for unit testing email functionality. It provides
 * comprehensive testing capabilities including message verification,
 * behavior simulation, and async utilities.
 */
export class MockTransport implements Transport {
  private config: ResolvedMockConfig;
  private sentMessages: Message[] = [];
  private nextResponse: Receipt | null = null;
  private messageIdCounter: number = 1;

  /**
   * Creates a new MockTransport instance.
   *
   * @param config Configuration options for the mock transport behavior.
   */
  constructor(config: MockConfig = {}) {
    this.config = createMockConfig(config);
  }

  /**
   * Sends an email message through the mock transport.
   *
   * The message is stored in memory and can be retrieved for testing verification.
   * Respects configured delays, failure rates, and response overrides.
   *
   * @param message The email message to send.
   * @param options Transport options including abort signal.
   * @returns A promise that resolves to a receipt indicating success or failure.
   * @throws {DOMException} When the operation is aborted via `AbortSignal`.
   */
  async send(message: Message, options?: TransportOptions): Promise<Receipt> {
    // Check for cancellation
    if (options?.signal?.aborted) {
      throw new DOMException("The operation was aborted.", "AbortError");
    }

    // Apply delay if configured
    await this.applyDelay();

    // Check for cancellation after delay
    if (options?.signal?.aborted) {
      throw new DOMException("The operation was aborted.", "AbortError");
    }

    // Store the message
    this.sentMessages.push(message);

    // Determine response
    const response = this.getResponse();

    return response;
  }

  /**
   * Sends multiple email messages through the mock transport.
   *
   * Each message is processed sequentially using the send() method, respecting
   * all configured behavior including delays and failure rates.
   *
   * @param messages An iterable or async iterable of messages to send.
   * @param options Transport options including abort signal.
   * @returns An async iterable of receipts, one for each message.
   * @throws {DOMException} When the operation is aborted via `AbortSignal`.
   */
  async *sendMany(
    messages: Iterable<Message> | AsyncIterable<Message>,
    options?: TransportOptions,
  ): AsyncIterable<Receipt> {
    for await (const message of messages) {
      if (options?.signal?.aborted) {
        throw new DOMException("The operation was aborted.", "AbortError");
      }
      yield await this.send(message, options);
    }
  }

  /**
   * Get all messages that have been "sent" through this transport.
   *
   * @returns A readonly array containing copies of all sent messages.
   */
  getSentMessages(): readonly Message[] {
    return [...this.sentMessages];
  }

  /**
   * Get the last message that was sent, or undefined if no messages have been sent.
   *
   * @returns The most recently sent message, or undefined if none.
   */
  getLastSentMessage(): Message | undefined {
    return this.sentMessages[this.sentMessages.length - 1];
  }

  /**
   * Get the total number of messages that have been sent.
   *
   * @returns The count of messages sent through this transport.
   */
  getSentMessagesCount(): number {
    return this.sentMessages.length;
  }

  /**
   * Clear all stored messages.
   *
   * This removes all messages from the internal storage but does not
   * reset other configuration like delays or failure rates.
   */
  clearSentMessages(): void {
    this.sentMessages = [];
  }

  /**
   * Set the response that will be returned for the next send operation.
   *
   * After being used once, it will revert to the default response.
   * This is useful for testing specific success or failure scenarios.
   *
   * @param receipt The receipt to return for the next send operation.
   */
  setNextResponse(receipt: Receipt): void {
    this.nextResponse = receipt;
  }

  /**
   * Set the default response that will be returned for send operations.
   *
   * This response is used when no next response is set and random failures
   * are not triggered.
   *
   * @param receipt The default receipt to return for send operations.
   */
  setDefaultResponse(receipt: Receipt): void {
    this.config = {
      ...this.config,
      defaultResponse: receipt,
    };
  }

  /**
   * Set the failure rate (0.0 to 1.0). When set, sends will randomly fail
   * at the specified rate instead of using the configured responses.
   *
   * @param rate The failure rate as a decimal between 0.0 and 1.0.
   * @throws {RangeError} When rate is not between 0.0 and 1.0.
   */
  setFailureRate(rate: number): void {
    if (rate < 0 || rate > 1) {
      throw new RangeError("Failure rate must be between 0.0 and 1.0");
    }
    this.config = {
      ...this.config,
      failureRate: rate,
    };
  }

  /**
   * Set a fixed delay in milliseconds for all send operations.
   *
   * This overrides any random delay range that was previously configured.
   *
   * @param milliseconds The delay in milliseconds (must be non-negative).
   * @throws {RangeError} When milliseconds is negative.
   */
  setDelay(milliseconds: number): void {
    if (milliseconds < 0) {
      throw new RangeError("Delay must be non-negative");
    }
    this.config = {
      ...this.config,
      delay: milliseconds,
      randomDelayRange: { min: 0, max: 0 },
    };
  }

  /**
   * Set a random delay range in milliseconds for send operations.
   *
   * This overrides any fixed delay that was previously configured.
   *
   * @param min The minimum delay in milliseconds.
   * @param max The maximum delay in milliseconds.
   * @throws {RangeError} When min or max is negative, or min > max.
   */
  setRandomDelay(min: number, max: number): void {
    if (min < 0 || max < 0 || min > max) {
      throw new RangeError("Invalid delay range");
    }
    this.config = {
      ...this.config,
      delay: 0,
      randomDelayRange: { min, max },
    };
  }

  /**
   * Find the first message matching the given predicate.
   *
   * @param predicate A function that tests each message.
   * @returns The first matching message, or undefined if none found.
   */
  findMessageBy(predicate: (message: Message) => boolean): Message | undefined {
    return this.sentMessages.find(predicate);
  }

  /**
   * Find all messages matching the given predicate.
   *
   * @param predicate A function that tests each message.
   * @returns An array of all matching messages.
   */
  findMessagesBy(predicate: (message: Message) => boolean): readonly Message[] {
    return this.sentMessages.filter(predicate);
  }

  /**
   * Get all messages sent to a specific email address.
   *
   * Searches through To, CC, and BCC recipients to find messages
   * that were sent to the specified email address.
   *
   * @param email The email address to search for.
   * @returns An array of messages sent to the specified address.
   */
  getMessagesTo(email: string): readonly Message[] {
    return this.sentMessages.filter((message) =>
      [...message.recipients, ...message.ccRecipients, ...message.bccRecipients]
        .some((addr) => addr.address === email)
    );
  }

  /**
   * Get all messages with a specific subject.
   *
   * @param subject The exact subject line to match.
   * @returns An array of messages with the specified subject.
   */
  getMessagesBySubject(subject: string): readonly Message[] {
    return this.sentMessages.filter((message) => message.subject === subject);
  }

  /**
   * Wait for a specific number of messages to be sent.
   *
   * This method polls the message count until the target is reached or
   * the timeout expires.  Useful for testing async email workflows where you
   * need to wait for messages to be sent.
   *
   * @param count The number of messages to wait for.
   * @param timeout The timeout in milliseconds (default: 5000).
   * @returns A promise that resolves when the count is reached.
   * @throws {Error} When the timeout is exceeded before reaching the target
   *                 count.
   */
  async waitForMessageCount(
    count: number,
    timeout: number = 5000,
  ): Promise<void> {
    const startTime = Date.now();

    while (this.sentMessages.length < count) {
      if (Date.now() - startTime > timeout) {
        throw new Error(
          `Timeout waiting for ${count} messages (got ${this.sentMessages.length})`,
        );
      }
      // Wait a bit before checking again
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  /**
   * Wait for a message matching the given predicate.
   *
   * This method polls for a matching message until one is found or the timeout
   * expires.  Useful for testing async email workflows where you need to wait
   * for specific messages.
   *
   * @param predicate A function that tests each message for a match.
   * @param timeout The timeout in milliseconds (default: 5000).
   * @returns A promise that resolves with the matching message.
   * @throws {Error} When the timeout is exceeded before finding a matching
   *                 message.
   */
  async waitForMessage(
    predicate: (message: Message) => boolean,
    timeout: number = 5000,
  ): Promise<Message> {
    const startTime = Date.now();

    while (true) {
      const message = this.findMessageBy(predicate);
      if (message) {
        return message;
      }

      if (Date.now() - startTime > timeout) {
        throw new Error("Timeout waiting for message");
      }

      // Wait a bit before checking again
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  /**
   * Reset the transport to its initial state.
   *
   * Clears all messages, resets all configuration to defaults, and
   * resets the message ID counter. This is useful for test cleanup.
   */
  reset(): void {
    this.sentMessages = [];
    this.nextResponse = null;
    this.config = createMockConfig();
    this.messageIdCounter = 1;
  }

  private async applyDelay(): Promise<void> {
    let delayMs = this.config.delay;

    if (
      this.config.randomDelayRange &&
      (this.config.randomDelayRange.min > 0 ||
        this.config.randomDelayRange.max > 0)
    ) {
      const { min, max } = this.config.randomDelayRange;
      delayMs = Math.random() * (max - min) + min;
    }

    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  private getResponse(): Receipt {
    // Check for random failure first
    if (
      this.config.failureRate > 0 && Math.random() < this.config.failureRate
    ) {
      return {
        successful: false,
        errorMessages: ["Simulated random failure"],
      };
    }

    // Use next response if set
    if (this.nextResponse) {
      const response = this.nextResponse;
      this.nextResponse = null;
      return response;
    }

    // Use default response, generating unique message ID if successful
    if (
      this.config.defaultResponse.successful &&
      this.config.generateUniqueMessageIds
    ) {
      return {
        successful: true,
        messageId: `mock-message-${this.messageIdCounter++}`,
      };
    }

    return this.config.defaultResponse;
  }
}

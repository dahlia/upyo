import type { Message, Receipt } from "@upyo/core";
import { MockTransport } from "@upyo/mock";
import { PoolTransport } from "../pool-transport.ts";
import type { PoolConfig, TransportEntry } from "../config.ts";

/**
 * Creates a test message with default values.
 */
export function createTestMessage(overrides?: Partial<Message>): Message {
  return {
    sender: { address: "sender@example.com", name: "Sender" },
    recipients: [{ address: "recipient@example.com", name: "Recipient" }],
    ccRecipients: [],
    bccRecipients: [],
    replyRecipients: [],
    attachments: [],
    subject: "Test Subject",
    content: { text: "Test content" },
    tags: [],
    priority: "normal",
    headers: new Headers(),
    ...overrides,
  };
}

/**
 * Creates a mock transport that always succeeds.
 */
export function createSuccessTransport(
  messageId = "success-id",
): MockTransport {
  const transport = new MockTransport();
  transport.setNextResponse({
    successful: true,
    messageId,
  });
  return transport;
}

/**
 * Creates a mock transport that always fails.
 */
export function createFailureTransport(
  errorMessage = "Transport failed",
): MockTransport {
  const transport = new MockTransport();
  transport.setNextResponse({
    successful: false,
    errorMessages: [errorMessage],
  });
  return transport;
}

/**
 * Creates a mock transport that fails N times then succeeds.
 */
export function createFlakeyTransport(
  failureCount: number,
  successId = "flaky-success",
  errorMessage = "Temporary failure",
): MockTransport {
  const transport = new MockTransport();
  let attempts = 0;

  // Override send method to implement flaky behavior
  const originalSend = transport.send.bind(transport);
  transport.send = (
    message: Message,
    options?: import("@upyo/core").TransportOptions,
  ): Promise<Receipt> => {
    attempts++;
    if (attempts <= failureCount) {
      transport.setNextResponse({
        successful: false,
        errorMessages: [errorMessage],
      });
    } else {
      transport.setNextResponse({
        successful: true,
        messageId: successId,
      });
    }
    return originalSend(message, options);
  };

  return transport;
}

/**
 * Creates a pool transport with the given configuration.
 */
export function createTestPoolTransport(
  config: Partial<PoolConfig> & { transports: TransportEntry[] },
): PoolTransport {
  return new PoolTransport({
    strategy: "round-robin",
    ...config,
  });
}

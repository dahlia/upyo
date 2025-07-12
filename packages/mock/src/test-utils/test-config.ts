import { createMessage, type Message } from "@upyo/core";
import { MockTransport } from "../mock-transport.ts";
import { createMockConfig, type MockConfig } from "../config.ts";

/**
 * Creates a test MockTransport with default configuration.
 *
 * @param config Optional configuration overrides
 * @returns A configured MockTransport instance
 */
export function createTestMockTransport(config?: MockConfig): MockTransport {
  return new MockTransport(createMockConfig(config));
}

/**
 * Creates a test message with sensible defaults for testing.
 *
 * @param overrides Optional properties to override defaults
 * @returns A test Message object
 */
export function createTestMessage(overrides: Partial<{
  from: string;
  to: string | string[];
  subject: string;
  content: { text: string } | { html: string; text?: string };
}> = {}): Message {
  return createMessage({
    from: overrides.from ?? "test-sender@example.com",
    to: overrides.to ?? "test-recipient@example.com",
    subject: overrides.subject ?? "Test Email",
    content: overrides.content ?? { text: "This is a test email message." },
  });
}

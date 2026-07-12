import type { Message } from "@upyo/core";
import process from "node:process";
import type { MailtrapConfig } from "../config.ts";

/**
 * Mailtrap E2E test configuration.
 */
export interface TestConfig {
  readonly mailtrap: MailtrapConfig;
  readonly from: `${string}@${string}`;
  readonly to: `${string}@${string}`;
}

/**
 * Checks whether Mailtrap E2E testing is configured.
 *
 * @returns `true` if all required environment variables are present.
 */
export function isE2eTestingEnabled(): boolean {
  return !!(
    process.env.MAILTRAP_API_TOKEN &&
    process.env.MAILTRAP_INBOX_ID &&
    process.env.MAILTRAP_FROM &&
    process.env.MAILTRAP_TO
  );
}

/**
 * Reads Mailtrap E2E test configuration from environment variables.
 *
 * @returns Mailtrap E2E test configuration.
 * @throws {Error} If required environment variables are missing.
 */
export function getTestConfig(): TestConfig {
  const apiToken = process.env.MAILTRAP_API_TOKEN;
  const inboxId = process.env.MAILTRAP_INBOX_ID;
  const from = process.env.MAILTRAP_FROM;
  const to = process.env.MAILTRAP_TO;

  if (!apiToken || !inboxId || !from || !to) {
    throw new Error(
      "MAILTRAP_API_TOKEN, MAILTRAP_INBOX_ID, MAILTRAP_FROM, and MAILTRAP_TO are required.",
    );
  }

  return {
    mailtrap: {
      apiToken,
      sandbox: process.env.MAILTRAP_SANDBOX !== "false",
      inboxId,
      ...(process.env.MAILTRAP_SEND_BASE_URL && {
        sendBaseUrl: process.env.MAILTRAP_SEND_BASE_URL,
      }),
      ...(process.env.MAILTRAP_SANDBOX_BASE_URL && {
        sandboxBaseUrl: process.env.MAILTRAP_SANDBOX_BASE_URL,
      }),
    },
    from: from as `${string}@${string}`,
    to: to as `${string}@${string}`,
  };
}

/**
 * Creates a test message for Mailtrap E2E tests.
 *
 * @param overrides Message fields to override.
 * @returns A test message.
 */
export function createTestMessage(overrides: Partial<Message> = {}): Message {
  const config = getTestConfig();
  return {
    sender: { address: config.from, name: "Upyo Test" },
    recipients: [{ address: config.to }],
    ccRecipients: [],
    bccRecipients: [],
    replyRecipients: [],
    subject: "[E2E] Mailtrap test",
    content: { text: "This is a test email sent through Mailtrap." },
    attachments: [],
    priority: "normal",
    tags: ["upyo-test"],
    headers: new Headers(),
    ...overrides,
  };
}

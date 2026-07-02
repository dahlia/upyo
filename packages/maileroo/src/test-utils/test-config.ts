import type { Message } from "@upyo/core";
import type { MailerooConfig } from "../config.ts";
import process from "node:process";

/**
 * Maileroo E2E test configuration.
 */
export interface TestConfig {
  readonly maileroo: MailerooConfig;
  readonly from: `${string}@${string}`;
  readonly to: `${string}@${string}`;
}

/**
 * Checks whether Maileroo E2E testing is configured.
 *
 * @returns `true` if all required environment variables are present.
 */
export function isE2eTestingEnabled(): boolean {
  return !!(
    process.env.MAILEROO_API_KEY &&
    process.env.MAILEROO_FROM &&
    process.env.MAILEROO_TO
  );
}

/**
 * Reads Maileroo E2E test configuration from environment variables.
 *
 * @returns Maileroo E2E test configuration.
 * @throws {Error} If required environment variables are missing.
 */
export function getTestConfig(): TestConfig {
  const apiKey = process.env.MAILEROO_API_KEY;
  const from = process.env.MAILEROO_FROM;
  const to = process.env.MAILEROO_TO;

  if (!apiKey || !from || !to) {
    throw new Error(
      "MAILEROO_API_KEY, MAILEROO_FROM, and MAILEROO_TO are required.",
    );
  }

  return {
    maileroo: {
      apiKey,
      timeout: 60000,
      retries: 6,
      ...(process.env.MAILEROO_BASE_URL && {
        baseUrl: process.env.MAILEROO_BASE_URL,
      }),
    },
    from: from as `${string}@${string}`,
    to: to as `${string}@${string}`,
  };
}

/**
 * Creates a test message for Maileroo E2E tests.
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
    subject: "[E2E] Maileroo test",
    content: { text: "This is a test email sent through Maileroo." },
    attachments: [],
    priority: "normal",
    tags: ["upyo-test"],
    headers: new Headers(),
    ...overrides,
  };
}

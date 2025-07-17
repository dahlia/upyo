import type {
  Address,
  Attachment,
  Message,
  MessageContent,
  Priority,
} from "@upyo/core";
import { isEmailAddress } from "@upyo/core";
import process from "node:process";
import type { SendGridConfig } from "../config.ts";

export interface TestEnvironmentConfig {
  sendgrid: SendGridConfig;
  testEmails: {
    from: string;
    to: string;
  };
}

export function getTestConfig(): TestEnvironmentConfig {
  if (!isE2eTestingEnabled()) {
    throw new Error(
      "E2E testing is not enabled. Set SENDGRID_API_KEY, SENDGRID_FROM, and SENDGRID_TO environment variables.",
    );
  }

  return {
    sendgrid: {
      apiKey: process.env.SENDGRID_API_KEY!,
    },
    testEmails: {
      from: process.env.SENDGRID_FROM!,
      to: process.env.SENDGRID_TO!,
    },
  };
}

export function isE2eTestingEnabled(): boolean {
  return !!(
    process.env.SENDGRID_API_KEY &&
    process.env.SENDGRID_FROM &&
    process.env.SENDGRID_TO
  );
}

export function createTestMessage(
  options: Partial<TestMessageOptions> = {},
): Message {
  const config = getTestConfig();
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substr(2, 9);

  const senderEmail = options.senderEmail ?? config.testEmails.from;
  const recipientEmail = options.recipientEmail ?? config.testEmails.to;

  if (!isEmailAddress(senderEmail)) {
    throw new Error(`Invalid sender email address: ${senderEmail}`);
  }
  if (!isEmailAddress(recipientEmail)) {
    throw new Error(`Invalid recipient email address: ${recipientEmail}`);
  }

  return {
    sender: {
      name: options.senderName ?? "SendGrid E2E Test Sender",
      address: senderEmail,
    },
    recipients: options.recipients ?? [{
      name: "E2E Test Recipient",
      address: recipientEmail,
    }],
    ccRecipients: options.ccRecipients ?? [],
    bccRecipients: options.bccRecipients ?? [],
    replyRecipients: options.replyRecipients ?? [],
    subject: options.subject ?? `[SendGrid E2E Test] ${timestamp}`,
    content: options.content ?? { text: `Test message content ${randomId}` },
    attachments: options.attachments ?? [],
    priority: options.priority ?? "normal",
    tags: options.tags ?? ["e2e-test"],
    headers: options.headers ?? new Headers(),
  };
}

export interface TestMessageOptions {
  senderName?: string;
  senderEmail?: string;
  recipientEmail?: string;
  recipients?: Address[];
  ccRecipients?: Address[];
  bccRecipients?: Address[];
  replyRecipients?: Address[];
  subject?: string;
  content?: MessageContent;
  attachments?: Attachment[];
  priority?: Priority;
  tags?: string[];
  headers?: Headers;
}

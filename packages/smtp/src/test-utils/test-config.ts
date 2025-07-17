import type {
  Address,
  Attachment,
  Message,
  MessageContent,
  Priority,
} from "@upyo/core";
import { isEmailAddress } from "@upyo/core";
import process from "node:process";
import type { SmtpConfig } from "../config.ts";
import type { MailpitConfig } from "./mailpit-client.ts";

export interface TestEnvironmentConfig {
  smtp: SmtpConfig;
  mailpit?: MailpitConfig;
  mockServer?: {
    port: number;
  };
}

export function getTestConfig(): TestEnvironmentConfig {
  if (!isMailpitTestingEnabled()) {
    throw new Error(
      "Mailpit testing is not enabled. Set MAILPIT_API_URL or MAILPIT_SMTP_HOST environment variables.",
    );
  }

  return {
    smtp: {
      host: process.env.MAILPIT_SMTP_HOST ?? "localhost",
      port: parseInt(process.env.MAILPIT_SMTP_PORT ?? "1025", 10),
      secure: process.env.MAILPIT_SMTP_SECURE === "true",
    },
    mailpit: {
      baseUrl: process.env.MAILPIT_API_URL ?? "http://localhost:8025",
    },
  };
}

export function isMailpitTestingEnabled(): boolean {
  return !!process.env.MAILPIT_API_URL || !!process.env.MAILPIT_SMTP_HOST;
}

export function createTestMessage(
  options: Partial<TestMessageOptions> = {},
): Message {
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substr(2, 9);

  const senderEmail = options.senderEmail ?? "sender@example.com";
  const recipientEmail = options.recipientEmail ?? "recipient@example.com";

  if (!isEmailAddress(senderEmail)) {
    throw new Error(`Invalid sender email address: ${senderEmail}`);
  }
  if (!isEmailAddress(recipientEmail)) {
    throw new Error(`Invalid recipient email address: ${recipientEmail}`);
  }

  return {
    sender: {
      name: options.senderName ?? "Test Sender",
      address: senderEmail,
    },
    recipients: options.recipients ?? [{
      name: "Test Recipient",
      address: recipientEmail,
    }],
    ccRecipients: options.ccRecipients ?? [],
    bccRecipients: options.bccRecipients ?? [],
    replyRecipients: options.replyRecipients ?? [],
    subject: options.subject ?? `Test Email ${timestamp}`,
    content: options.content ?? { text: `Test message content ${randomId}` },
    attachments: options.attachments ?? [],
    priority: options.priority ?? "normal",
    tags: options.tags ?? [],
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

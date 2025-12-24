import type { Attachment, Message } from "@upyo/core";
import process from "node:process";
import type { JmapConfig } from "../config.ts";

/**
 * Configuration for Stalwart E2E tests.
 * @since 0.4.0
 */
export interface TestConfig {
  readonly jmap: JmapConfig;
  readonly stalwart: {
    readonly apiUrl: string;
    readonly adminToken: string;
  };
}

/**
 * Check if Stalwart testing is enabled via environment variables.
 * @returns true if STALWART_SESSION_URL and authentication credentials are set.
 * @since 0.4.0
 */
export function isStalwartTestingEnabled(): boolean {
  const sessionUrl = process.env.STALWART_SESSION_URL;
  const bearerToken = process.env.STALWART_BEARER_TOKEN;
  const basicUsername = process.env.STALWART_USERNAME;
  const basicPassword = process.env.STALWART_PASSWORD;
  return !!sessionUrl &&
    (!!bearerToken || (!!basicUsername && !!basicPassword));
}

/**
 * Get test configuration from environment variables.
 * @returns Test configuration object.
 * @throws Error if required environment variables are not set.
 * @since 0.4.0
 */
export function getTestConfig(): TestConfig {
  const sessionUrl = process.env.STALWART_SESSION_URL;
  const bearerToken = process.env.STALWART_BEARER_TOKEN;
  const basicUsername = process.env.STALWART_USERNAME;
  const basicPassword = process.env.STALWART_PASSWORD;
  const apiUrl = process.env.STALWART_API_URL;
  const adminToken = process.env.STALWART_ADMIN_TOKEN;

  if (!sessionUrl) {
    throw new Error(
      "STALWART_SESSION_URL environment variable must be set for E2E tests",
    );
  }

  if (!bearerToken && (!basicUsername || !basicPassword)) {
    throw new Error(
      "Either STALWART_BEARER_TOKEN or (STALWART_USERNAME and STALWART_PASSWORD) must be set for E2E tests",
    );
  }

  // Extract base URL from session URL for URL rewriting
  const baseUrl = process.env.STALWART_BASE_URL ||
    sessionUrl.replace(/\/jmap\/session$/, "").replace(
      /\/.well-known\/jmap$/,
      "",
    );

  const jmap: JmapConfig = bearerToken
    ? {
      sessionUrl,
      bearerToken,
      timeout: 30000,
      retries: 3,
      baseUrl,
    }
    : {
      sessionUrl,
      basicAuth: {
        username: basicUsername!,
        password: basicPassword!,
      },
      timeout: 30000,
      retries: 3,
      baseUrl,
    };

  return {
    jmap,
    stalwart: {
      apiUrl: apiUrl || sessionUrl.replace("/jmap/session", ""),
      adminToken: adminToken || bearerToken || "",
    },
  };
}

/**
 * Create a test message with default values.
 * @param options Message options to override defaults.
 * @returns A message object suitable for testing.
 * @since 0.4.0
 */
export interface CreateTestMessageOptions {
  readonly senderEmail?: string;
  readonly senderName?: string;
  readonly recipientEmail?: string;
  readonly subject?: string;
  readonly content?: { text: string } | { html: string; text?: string };
  readonly attachments?: ReadonlyArray<{
    readonly filename: string;
    readonly contentType: `${string}/${string}`;
    readonly content: Uint8Array;
    readonly contentId: string;
    readonly inline: boolean;
  }>;
}

/**
 * Create a test message for E2E tests.
 * @param options Options for the test message.
 * @returns A message object.
 * @since 0.4.0
 */
export function createTestMessage(
  options: CreateTestMessageOptions = {},
): Message {
  const content = options.content || { text: "This is a test email." };
  const attachments: readonly Attachment[] = options.attachments || [];

  return {
    sender: {
      address: (options.senderEmail ||
        "test@mail.example.com") as `${string}@${string}`,
      name: options.senderName,
    },
    recipients: [
      {
        address: (options.recipientEmail ||
          "recipient@mail.example.com") as `${string}@${string}`,
      },
    ],
    ccRecipients: [],
    bccRecipients: [],
    replyRecipients: [],
    attachments,
    subject: options.subject || "Test Email",
    content,
    priority: "normal",
    tags: [],
    headers: new Headers(),
  };
}

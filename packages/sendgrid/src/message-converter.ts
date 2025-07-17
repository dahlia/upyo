import type { Address, Attachment, Message } from "@upyo/core";
import type { ResolvedSendGridConfig } from "./config.ts";

/**
 * SendGrid personalization object for individual recipients.
 */
interface SendGridPersonalization {
  to: Array<{ email: string; name?: string }>;
  cc?: Array<{ email: string; name?: string }>;
  bcc?: Array<{ email: string; name?: string }>;
  subject?: string;
  headers?: Record<string, string>;
  custom_args?: Record<string, string>;
  send_at?: number;
}

/**
 * SendGrid content object for email content.
 */
interface SendGridContent {
  type: string;
  value: string;
}

/**
 * SendGrid attachment object.
 */
interface SendGridAttachment {
  content: string;
  type?: string;
  filename?: string;
  disposition?: "attachment" | "inline";
  content_id?: string;
}

/**
 * SendGrid mail object structure for API requests.
 */
interface SendGridMail {
  personalizations: SendGridPersonalization[];
  from: { email: string; name?: string };
  reply_to?: { email: string; name?: string };
  reply_to_list?: Array<{ email: string; name?: string }>;
  subject?: string;
  content?: SendGridContent[];
  attachments?: SendGridAttachment[];
  template_id?: string;
  headers?: Record<string, string>;
  categories?: string[];
  custom_args?: Record<string, string>;
  send_at?: number;
  batch_id?: string;
  asm?: {
    group_id: number;
    groups_to_display?: number[];
  };
  ip_pool_name?: string;
  mail_settings?: {
    bcc?: {
      enable?: boolean;
      email?: string;
    };
    bypass_list_management?: {
      enable?: boolean;
    };
    footer?: {
      enable?: boolean;
      text?: string;
      html?: string;
    };
    sandbox_mode?: {
      enable?: boolean;
    };
    spam_check?: {
      enable?: boolean;
      threshold?: number;
      post_to_url?: string;
    };
  };
  tracking_settings?: {
    click_tracking?: {
      enable?: boolean;
      enable_text?: boolean;
    };
    open_tracking?: {
      enable?: boolean;
      substitution_tag?: string;
    };
    subscription_tracking?: {
      enable?: boolean;
      text?: string;
      html?: string;
      substitution_tag?: string;
    };
    ganalytics?: {
      enable?: boolean;
      utm_source?: string;
      utm_medium?: string;
      utm_term?: string;
      utm_content?: string;
      utm_campaign?: string;
    };
  };
}

/**
 * Converts a Upyo Message to SendGrid API JSON format.
 *
 * This function transforms the standardized Upyo message format into
 * the specific format expected by the SendGrid API.
 *
 * @param message - The Upyo message to convert
 * @param config - The resolved SendGrid configuration
 * @returns Promise that resolves to a SendGrid mail object
 *
 * @example
 * ```typescript
 * const mailData = await convertMessage(message, config);
 * const response = await httpClient.sendMessage(mailData);
 * ```
 */
export async function convertMessage(
  message: Message,
  config: ResolvedSendGridConfig,
): Promise<SendGridMail> {
  const sendGridMail: SendGridMail = {
    personalizations: [],
    from: formatAddress(message.sender),
  };

  // Create personalization object
  const personalization: SendGridPersonalization = {
    to: message.recipients.map(formatAddress),
    subject: message.subject,
  };

  // Add CC recipients if any
  if (message.ccRecipients.length > 0) {
    personalization.cc = message.ccRecipients.map(formatAddress);
  }

  // Add BCC recipients if any
  if (message.bccRecipients.length > 0) {
    personalization.bcc = message.bccRecipients.map(formatAddress);
  }

  sendGridMail.personalizations.push(personalization);

  // Reply-to handling
  if (message.replyRecipients.length > 0) {
    if (message.replyRecipients.length === 1) {
      sendGridMail.reply_to = formatAddress(message.replyRecipients[0]);
    } else {
      sendGridMail.reply_to_list = message.replyRecipients.map(formatAddress);
    }
  }

  // Content
  const content: SendGridContent[] = [];

  if ("html" in message.content) {
    if (message.content.text) {
      content.push({
        type: "text/plain",
        value: message.content.text,
      });
    }
    content.push({
      type: "text/html",
      value: message.content.html,
    });
  } else {
    content.push({
      type: "text/plain",
      value: message.content.text,
    });
  }

  sendGridMail.content = content;

  // Priority handling (using custom headers)
  if (message.priority !== "normal") {
    const headers: Record<string, string> = {};

    switch (message.priority) {
      case "high":
        headers["X-Priority"] = "1";
        headers["X-MSMail-Priority"] = "High";
        headers["Importance"] = "High";
        break;
      case "low":
        headers["X-Priority"] = "5";
        headers["X-MSMail-Priority"] = "Low";
        headers["Importance"] = "Low";
        break;
    }

    sendGridMail.headers = { ...sendGridMail.headers, ...headers };
  }

  // Tags (categories in SendGrid)
  if (message.tags.length > 0) {
    sendGridMail.categories = [...message.tags];
  }

  // Custom headers
  const customHeaders: Record<string, string> = {};
  for (const [key, value] of message.headers.entries()) {
    // Skip standard headers that are handled separately
    if (!isStandardHeader(key)) {
      customHeaders[key] = value;
    }
  }

  if (Object.keys(customHeaders).length > 0) {
    sendGridMail.headers = { ...sendGridMail.headers, ...customHeaders };
  }

  // Attachments
  if (message.attachments.length > 0) {
    sendGridMail.attachments = await Promise.all(
      message.attachments.map(convertAttachment),
    );
  }

  // Tracking settings
  const trackingSettings: NonNullable<SendGridMail["tracking_settings"]> = {};

  if (config.clickTracking !== undefined) {
    trackingSettings.click_tracking = {
      enable: config.clickTracking,
      enable_text: config.clickTracking,
    };
  }

  if (config.openTracking !== undefined) {
    trackingSettings.open_tracking = {
      enable: config.openTracking,
    };
  }

  if (config.subscriptionTracking !== undefined) {
    trackingSettings.subscription_tracking = {
      enable: config.subscriptionTracking,
    };
  }

  if (config.googleAnalytics !== undefined) {
    trackingSettings.ganalytics = {
      enable: config.googleAnalytics,
    };
  }

  if (Object.keys(trackingSettings).length > 0) {
    sendGridMail.tracking_settings = trackingSettings;
  }

  return sendGridMail;
}

/**
 * Formats an address for SendGrid API.
 *
 * @param address - The address to format
 * @returns Formatted address object
 */
function formatAddress(address: Address): { email: string; name?: string } {
  const result: { email: string; name?: string } = {
    email: address.address,
  };

  if (address.name) {
    result.name = address.name;
  }

  return result;
}

/**
 * Converts a Upyo attachment to SendGrid format.
 *
 * @param attachment - The attachment to convert
 * @returns Promise that resolves to a SendGrid attachment object
 */
async function convertAttachment(
  attachment: Attachment,
): Promise<SendGridAttachment> {
  // Get the content as Uint8Array then convert to base64
  const contentBytes = await attachment.content;

  // Convert to base64
  const base64Content = btoa(
    String.fromCharCode(...contentBytes),
  );

  const sendGridAttachment: SendGridAttachment = {
    content: base64Content,
    filename: attachment.filename,
  };

  if (attachment.contentType) {
    sendGridAttachment.type = attachment.contentType;
  }

  if (attachment.inline && attachment.contentId) {
    sendGridAttachment.disposition = "inline";
    sendGridAttachment.content_id = attachment.contentId;
  } else {
    sendGridAttachment.disposition = "attachment";
  }

  return sendGridAttachment;
}

/**
 * Checks if a header is a standard email header that should not be added as custom header.
 *
 * @param headerName - The header name to check
 * @returns True if it's a standard header
 */
function isStandardHeader(headerName: string): boolean {
  const standardHeaders = [
    "from",
    "to",
    "cc",
    "bcc",
    "reply-to",
    "subject",
    "date",
    "message-id",
    "content-type",
    "content-transfer-encoding",
    "mime-version",
    "x-priority",
    "x-msmail-priority",
    "importance",
  ];

  return standardHeaders.includes(headerName.toLowerCase());
}

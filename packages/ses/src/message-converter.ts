import type { Address, Message } from "@upyo/core";
import { combineSignals, readAttachmentContent } from "@upyo/core";
import { createCalendarAttachment } from "@upyo/core/calendar";
import type { ResolvedSesConfig } from "./config.ts";

interface SesDestination {
  ToAddresses?: string[];
  CcAddresses?: string[];
  BccAddresses?: string[];
}

interface SesSimpleContent {
  Subject: {
    Data: string;
    Charset?: string;
  };
  Body: {
    Text?: {
      Data: string;
      Charset?: string;
    };
    Html?: {
      Data: string;
      Charset?: string;
    };
  };
  Attachments?: SesAttachment[];
}

interface SesAttachment {
  ContentDescription?: string;
  ContentDisposition?: string;
  ContentId?: string;
  ContentTransferEncoding?: string;
  ContentType?: string;
  FileName?: string;
  RawContent: string;
}

interface SesRawContent {
  Data: string;
}

interface SesContent {
  Simple?: SesSimpleContent;
  Raw?: SesRawContent;
}

interface SesEmailMessage {
  Destination: SesDestination;
  Content: SesContent;
  FromEmailAddress?: string;
  ReplyToAddresses?: string[];
  FeedbackForwardingEmailAddress?: string;
  ConfigurationSetName?: string;
  Tags?: Array<{
    Name: string;
    Value: string;
  }>;
  DefaultEmailTags?: Array<{
    Name: string;
    Value: string;
  }>;
}

export async function convertMessage(
  message: Message,
  config: ResolvedSesConfig,
  signal?: AbortSignal,
): Promise<SesEmailMessage> {
  const destination: SesDestination = {};

  if (message.recipients.length > 0) {
    destination.ToAddresses = message.recipients.map(formatAddress);
  }

  if (message.ccRecipients.length > 0) {
    destination.CcAddresses = message.ccRecipients.map(formatAddress);
  }

  if (message.bccRecipients.length > 0) {
    destination.BccAddresses = message.bccRecipients.map(formatAddress);
  }

  const sesMessage: SesEmailMessage = {
    Destination: destination,
    Content: {},
    FromEmailAddress: formatAddress(message.sender),
  };

  if (message.replyRecipients.length > 0) {
    sesMessage.ReplyToAddresses = message.replyRecipients.map(formatAddress);
  }

  if (config.configurationSetName) {
    sesMessage.ConfigurationSetName = config.configurationSetName;
  }

  sesMessage.Content.Simple = await createSimpleContent(message, signal);

  const tags: Array<{ Name: string; Value: string }> = [];

  if (message.tags.length > 0) {
    for (const tag of message.tags) {
      tags.push({ Name: "category", Value: tag });
    }
  }

  if (message.priority !== "normal") {
    tags.push({ Name: "priority", Value: message.priority });
  }

  for (const [name, value] of Object.entries(config.defaultTags)) {
    tags.push({ Name: name, Value: value });
  }

  if (tags.length > 0) {
    sesMessage.Tags = tags;
  }

  return sesMessage;
}

async function createSimpleContent(
  message: Message,
  signal?: AbortSignal,
): Promise<SesSimpleContent> {
  const content: SesSimpleContent = {
    Subject: {
      Data: message.subject,
      Charset: "UTF-8",
    },
    Body: {},
  };

  if ("html" in message.content) {
    content.Body.Html = {
      Data: message.content.html,
      Charset: "UTF-8",
    };

    if (message.content.text) {
      content.Body.Text = {
        Data: message.content.text,
        Charset: "UTF-8",
      };
    }
  } else {
    content.Body.Text = {
      Data: message.content.text,
      Charset: "UTF-8",
    };
  }

  // A transport that cannot compose a `text/calendar` alternative carries the
  // scheduling payload as an *invite.ics* part instead, ahead of the caller's
  // own files so that a client looking for the first calendar part finds it.
  const attachments = message.calendar == null
    ? message.attachments
    : [createCalendarAttachment(message.calendar), ...message.attachments];

  if (attachments.length > 0) {
    const cancellation = new AbortController();
    const combined = combineSignals(cancellation.signal, signal);
    try {
      content.Attachments = await Promise.all(
        attachments.map(async (attachment) => {
          const contentBytes = await readAttachmentContent(
            attachment.content,
            combined.signal,
          );
          const parts: string[] = [];
          for (let offset = 0; offset < contentBytes.length; offset += 8192) {
            parts.push(
              String.fromCharCode(
                ...contentBytes.subarray(offset, offset + 8192),
              ),
            );
          }
          const base64Content = btoa(parts.join(""));

          const converted: SesAttachment = {
            FileName: attachment.filename,
            ContentType: attachment.contentType || "application/octet-stream",
            ContentDisposition: attachment.inline ? "INLINE" : "ATTACHMENT",
            ContentTransferEncoding: "BASE64",
            RawContent: base64Content,
          };
          // An empty content ID is how Upyo spells "this part has none", so it
          // is left out rather than sent as an empty header value.
          if (attachment.contentId !== "") {
            converted.ContentId = attachment.contentId;
          }
          return converted;
        }),
      );
    } finally {
      cancellation.abort();
      combined.cleanup();
    }
  }

  return content;
}

function formatAddress(address: Address): string {
  if (address.name) {
    return `"${address.name}" <${address.address}>`;
  }
  return address.address;
}

interface SesBulkEmailEntry {
  Destination: SesDestination;
  ReplacementEmailContent?: SesContent;
  ReplacementTags?: Array<{
    Name: string;
    Value: string;
  }>;
}

interface SesBulkEmailMessage {
  FromEmailAddress?: string;
  ReplyToAddresses?: string[];
  ConfigurationSetName?: string;
  DefaultContent: SesContent;
  DefaultEmailTags?: Array<{
    Name: string;
    Value: string;
  }>;
  BulkEmailEntries: SesBulkEmailEntry[];
}

export async function convertMessagesToBulk(
  messages: Message[],
  config: ResolvedSesConfig,
  signal?: AbortSignal,
): Promise<SesBulkEmailMessage> {
  if (messages.length === 0) {
    throw new Error("Cannot convert empty message array to bulk email");
  }

  const firstMessage = messages[0];
  const defaultContent = await createSimpleContent(firstMessage, signal);

  const defaultTags: Array<{ Name: string; Value: string }> = [];
  for (const [name, value] of Object.entries(config.defaultTags)) {
    defaultTags.push({ Name: name, Value: value });
  }

  const bulkMessage: SesBulkEmailMessage = {
    FromEmailAddress: formatAddress(firstMessage.sender),
    DefaultContent: { Simple: defaultContent },
    DefaultEmailTags: defaultTags.length > 0 ? defaultTags : undefined,
    BulkEmailEntries: [],
  };

  if (firstMessage.replyRecipients.length > 0) {
    bulkMessage.ReplyToAddresses = firstMessage.replyRecipients.map(
      formatAddress,
    );
  }

  if (config.configurationSetName) {
    bulkMessage.ConfigurationSetName = config.configurationSetName;
  }

  for (const message of messages) {
    const destination: SesDestination = {};

    if (message.recipients.length > 0) {
      destination.ToAddresses = message.recipients.map(formatAddress);
    }
    if (message.ccRecipients.length > 0) {
      destination.CcAddresses = message.ccRecipients.map(formatAddress);
    }
    if (message.bccRecipients.length > 0) {
      destination.BccAddresses = message.bccRecipients.map(formatAddress);
    }

    const entry: SesBulkEmailEntry = {
      Destination: destination,
    };

    const isContentDifferent = message.subject !== firstMessage.subject ||
      JSON.stringify(message.content) !==
        JSON.stringify(firstMessage.content) ||
      JSON.stringify(message.calendar) !==
        JSON.stringify(firstMessage.calendar) ||
      message.attachments.length !== firstMessage.attachments.length ||
      (message.attachments.length > 0 &&
        JSON.stringify(
            message.attachments.map((a) => ({
              filename: a.filename,
              contentType: a.contentType,
              contentId: a.contentId,
              inline: a.inline,
            })),
          ) !==
          JSON.stringify(
            firstMessage.attachments.map((a) => ({
              filename: a.filename,
              contentType: a.contentType,
              contentId: a.contentId,
              inline: a.inline,
            })),
          ));

    if (isContentDifferent) {
      const messageContent = await createSimpleContent(message, signal);
      entry.ReplacementEmailContent = { Simple: messageContent };
    }

    const messageTags: Array<{ Name: string; Value: string }> = [];

    if (message.tags.length > 0) {
      for (const tag of message.tags) {
        messageTags.push({ Name: "category", Value: tag });
      }
    }

    if (message.priority !== "normal") {
      messageTags.push({ Name: "priority", Value: message.priority });
    }

    if (messageTags.length > 0) {
      entry.ReplacementTags = messageTags;
    }

    bulkMessage.BulkEmailEntries.push(entry);
  }

  return bulkMessage;
}

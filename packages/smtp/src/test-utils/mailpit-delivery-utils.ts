import type {
  MailpitClient,
  MailpitMessage,
  MailpitSearchCriteria,
} from "./mailpit-client.ts";

export interface MailpitContentExpectation {
  readonly subject?: string;
  readonly from?: string;
  readonly to?: string;
  readonly htmlBody?: string;
  readonly textBody?: string;
  readonly attachments?: Array<{
    readonly filename: string;
    readonly contentType?: string;
    readonly contentId?: string;
    readonly size?: number;
  }>;
}

export interface MailpitValidationResult {
  readonly isValid: boolean;
  readonly errors: string[];
}

export async function waitForMailpitDelivery(
  client: MailpitClient,
  criteria: MailpitSearchCriteria,
  timeout: number = 30000,
): Promise<MailpitMessage> {
  return await client.waitForMessage(criteria, timeout);
}

export function validateMailpitEmailContent(
  message: MailpitMessage,
  expected: MailpitContentExpectation,
): MailpitValidationResult {
  const errors: string[] = [];

  if (expected.subject && message.Subject !== expected.subject) {
    errors.push(
      `Subject mismatch: expected "${expected.subject}", got "${message.Subject}"`,
    );
  }

  if (expected.from && message.From.Address !== expected.from) {
    errors.push(
      `From mismatch: expected "${expected.from}", got "${message.From.Address}"`,
    );
  }

  if (expected.to) {
    const toAddresses = message.To.map((addr) => addr.Address);
    if (!toAddresses.includes(expected.to)) {
      errors.push(
        `To mismatch: expected "${expected.to}", got "${
          toAddresses.join(", ")
        }"`,
      );
    }
  }

  if (
    expected.htmlBody && message.HTML &&
    !message.HTML.includes(expected.htmlBody)
  ) {
    errors.push(
      `HTML body does not contain expected content: "${expected.htmlBody}"`,
    );
  }

  if (
    expected.textBody && message.Text &&
    !message.Text.includes(expected.textBody)
  ) {
    errors.push(
      `Text body does not contain expected content: "${expected.textBody}"`,
    );
  }

  if (expected.attachments && message.Attachments) {
    for (const expectedAttachment of expected.attachments) {
      const attachment = message.Attachments.find(
        (a) => a.FileName === expectedAttachment.filename,
      );

      if (!attachment) {
        errors.push(`Missing attachment: "${expectedAttachment.filename}"`);
        continue;
      }

      if (
        expectedAttachment.contentType &&
        attachment.ContentType !== expectedAttachment.contentType
      ) {
        errors.push(
          `Attachment content type mismatch for "${expectedAttachment.filename}": expected "${expectedAttachment.contentType}", got "${attachment.ContentType}"`,
        );
      }

      if (
        expectedAttachment.contentId &&
        attachment.ContentID !== expectedAttachment.contentId
      ) {
        errors.push(
          `Attachment content ID mismatch for "${expectedAttachment.filename}": expected "${expectedAttachment.contentId}", got "${attachment.ContentID}"`,
        );
      }

      if (
        expectedAttachment.size !== undefined &&
        attachment.Size !== expectedAttachment.size
      ) {
        errors.push(
          `Attachment size mismatch for "${expectedAttachment.filename}": expected ${expectedAttachment.size}, got ${attachment.Size}`,
        );
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

export function validateMailpitAttachments(
  message: MailpitMessage,
  expectedAttachments: Array<{
    readonly filename: string;
    readonly contentType?: string;
    readonly contentId?: string;
    readonly size?: number;
  }>,
): MailpitValidationResult {
  const errors: string[] = [];

  if (!message.Attachments) {
    errors.push("Message has no attachments array");
    return { isValid: false, errors };
  }

  if (message.Attachments.length !== expectedAttachments.length) {
    errors.push(
      `Attachment count mismatch: expected ${expectedAttachments.length}, got ${message.Attachments.length}`,
    );
  }

  for (const expected of expectedAttachments) {
    const attachment = message.Attachments.find((a) =>
      a.FileName === expected.filename
    );

    if (!attachment) {
      errors.push(`Missing attachment: "${expected.filename}"`);
      continue;
    }

    if (
      expected.contentType && attachment.ContentType !== expected.contentType
    ) {
      errors.push(
        `Content type mismatch for "${expected.filename}": expected "${expected.contentType}", got "${attachment.ContentType}"`,
      );
    }

    if (expected.contentId && attachment.ContentID !== expected.contentId) {
      errors.push(
        `Content ID mismatch for "${expected.filename}": expected "${expected.contentId}", got "${attachment.ContentID}"`,
      );
    }

    if (expected.size !== undefined && attachment.Size !== expected.size) {
      errors.push(
        `Size mismatch for "${expected.filename}": expected ${expected.size}, got ${attachment.Size}`,
      );
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

export async function cleanupMailpitEmails(
  client: MailpitClient,
  criteria?: MailpitSearchCriteria,
): Promise<number> {
  let deletedCount = 0;

  if (criteria) {
    const messages = await client.searchMessages(criteria);
    for (const message of messages) {
      await client.deleteMessage(message.ID);
      deletedCount++;
    }
  } else {
    await client.deleteAllMessages();
    // Since we don't know the exact count, we'll return a placeholder
    deletedCount = -1; // Indicates all messages were deleted
  }

  return deletedCount;
}

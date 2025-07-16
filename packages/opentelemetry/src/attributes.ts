import type { Message } from "@upyo/core";

/**
 * Email attribute extractor class for generating OpenTelemetry attributes.
 * Handles extraction of message metadata, error information, and transport details
 * while respecting privacy settings for sensitive data.
 *
 * This class provides methods for extracting attributes from email messages,
 * batch operations, and errors, making them suitable for use in OpenTelemetry
 * spans and metrics.
 *
 * @example
 * ```typescript
 * import { EmailAttributeExtractor } from "@upyo/opentelemetry";
 *
 * const extractor = new EmailAttributeExtractor(
 *   "smtp",           // transport name
 *   false,            // don't record sensitive data
 *   "2.1.0"          // transport version
 * );
 *
 * // Extract attributes from a message
 * const messageAttrs = extractor.extractMessageAttributes(message);
 *
 * // Extract attributes from batch operations
 * const batchAttrs = extractor.extractBatchAttributes(messages, batchSize);
 *
 * // Extract attributes from errors
 * const errorAttrs = extractor.extractErrorAttributes(error, "network");
 * ```
 *
 * @since 0.2.0
 */
export class EmailAttributeExtractor {
  private readonly recordSensitiveData: boolean;
  private readonly transportName: string;
  private readonly transportVersion?: string;

  constructor(
    transportName: string,
    recordSensitiveData = false,
    transportVersion?: string,
  ) {
    this.transportName = transportName;
    this.recordSensitiveData = recordSensitiveData;
    this.transportVersion = transportVersion;
  }

  /**
   * Extracts attributes for a single message send operation.
   */
  extractMessageAttributes(
    message: Message,
  ): Record<string, string | number | boolean> {
    const attributes: Record<string, string | number | boolean> = {
      // General operation attributes (following OTel patterns)
      "operation.name": "email.send",
      "operation.type": "email",

      // Email-specific attributes (new namespace)
      "email.to.count": message.recipients.length,
      "email.cc.count": message.ccRecipients.length,
      "email.bcc.count": message.bccRecipients.length,
      "email.attachments.count": message.attachments.length,
      "email.priority": message.priority,
      "email.tags": JSON.stringify(message.tags),

      // Upyo-specific attributes (vendor namespace)
      "upyo.transport.name": this.transportName,
      "upyo.retry.count": 0, // Will be updated by transport if retries occur
      "upyo.batch.size": 1,
    };

    // Add transport version if available
    if (this.transportVersion) {
      attributes["upyo.transport.version"] = this.transportVersion;
    }

    // Conditionally add sensitive data
    if (this.recordSensitiveData) {
      attributes["email.from.address"] = message.sender.address;
      attributes["email.subject.length"] = message.subject.length;
    } else {
      // Redacted versions
      attributes["email.from.domain"] = this.extractDomain(
        message.sender.address,
      );
      attributes["email.subject.length"] = message.subject.length;
    }

    // Content type detection
    attributes["email.content.type"] = this.detectContentType(message);

    // Calculate message size estimate
    attributes["email.message.size"] = this.estimateMessageSize(message);

    return attributes;
  }

  /**
   * Extracts attributes for batch send operations.
   */
  extractBatchAttributes(
    messages: readonly Message[],
    batchSize: number,
  ): Record<string, string | number | boolean> {
    const totalAttachments = messages.reduce(
      (sum, msg) => sum + msg.attachments.length,
      0,
    );
    const totalSize = messages.reduce(
      (sum, msg) => sum + this.estimateMessageSize(msg),
      0,
    );

    const attributes: Record<string, string | number | boolean> = {
      // General operation attributes
      "operation.name": "email.send_batch",
      "operation.type": "email",

      // Batch-specific attributes
      "email.batch.size": batchSize,
      "email.batch.total_recipients": messages.reduce(
        (sum, msg) =>
          sum + msg.recipients.length + msg.ccRecipients.length +
          msg.bccRecipients.length,
        0,
      ),
      "email.batch.total_attachments": totalAttachments,
      "email.batch.total_size": totalSize,

      // Upyo-specific attributes
      "upyo.transport.name": this.transportName,
      "upyo.batch.size": batchSize,
    };

    // Add transport version if available
    if (this.transportVersion) {
      attributes["upyo.transport.version"] = this.transportVersion;
    }

    return attributes;
  }

  /**
   * Extracts network-related attributes from transport configuration.
   */
  extractNetworkAttributes(
    protocol: "smtp" | "https" | "http",
    serverAddress?: string,
    serverPort?: number,
  ): Record<string, string | number | boolean> {
    const attributes: Record<string, string | number | boolean> = {
      "network.protocol.name": protocol,
    };

    if (serverAddress) {
      attributes["server.address"] = serverAddress;
    }

    if (serverPort) {
      attributes["server.port"] = serverPort;
    }

    return attributes;
  }

  /**
   * Extracts error-related attributes.
   */
  extractErrorAttributes(
    error: unknown,
    errorCategory: string,
  ): Record<string, string | number | boolean> {
    const attributes: Record<string, string | number | boolean> = {
      "error.type": errorCategory,
    };

    if (error instanceof Error) {
      attributes["error.name"] = error.name;

      // Only record error message if not sensitive data mode or if it's a safe error
      if (this.recordSensitiveData || this.isSafeErrorMessage(error.message)) {
        attributes["error.message"] = error.message;
      }
    }

    return attributes;
  }

  private detectContentType(message: Message): string {
    // If there are attachments, it's always multipart
    if (message.attachments.length > 0) {
      return "multipart";
    }

    // For content without attachments
    if ("html" in message.content) {
      return "html";
    }
    return "text";
  }

  private estimateMessageSize(message: Message): number {
    let size = 0;

    // Headers estimate (rough)
    size += 500;

    // Subject
    size += message.subject.length;

    // Content
    if ("html" in message.content) {
      size += message.content.html.length;
      if (message.content.text) {
        size += message.content.text.length;
      }
    } else {
      size += message.content.text.length;
    }

    // Attachments estimate (metadata only, not content)
    size += message.attachments.length * 100; // Rough header estimate per attachment

    return size;
  }

  private extractDomain(email: string): string {
    const atIndex = email.lastIndexOf("@");
    return atIndex > 0 ? email.substring(atIndex + 1) : "unknown";
  }

  private isSafeErrorMessage(message: string): boolean {
    const safePatterns = [
      /^timeout/i,
      /^connection/i,
      /^network/i,
      /^dns/i,
      /^rate limit/i,
      /^quota exceeded/i,
      /^service unavailable/i,
      /^internal server error/i,
      /^bad gateway/i,
      /^gateway timeout/i,
    ];

    return safePatterns.some((pattern) => pattern.test(message));
  }
}

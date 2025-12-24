import type {
  Attachment,
  Message,
  Receipt,
  Transport,
  TransportOptions,
} from "@upyo/core";
import { uploadBlob } from "./blob-uploader.ts";
import {
  createJmapConfig,
  type JmapConfig,
  type ResolvedJmapConfig,
} from "./config.ts";
import { JmapApiError } from "./errors.ts";
import { JmapHttpClient, type JmapResponse } from "./http-client.ts";
import { convertMessage } from "./message-converter.ts";
import { findMailAccount, type JmapSession } from "./session.ts";

/**
 * JMAP capabilities required for email sending.
 * @since 0.4.0
 */
const JMAP_CAPABILITIES = {
  core: "urn:ietf:params:jmap:core",
  mail: "urn:ietf:params:jmap:mail",
  submission: "urn:ietf:params:jmap:submission",
} as const;

/**
 * JMAP transport for sending emails via JMAP protocol (RFC 8620/8621).
 * @since 0.4.0
 */
export class JmapTransport implements Transport {
  readonly config: ResolvedJmapConfig;
  private readonly httpClient: JmapHttpClient;
  private cachedSession: { session: JmapSession; fetchedAt: number } | null =
    null;

  /**
   * Creates a new JMAP transport instance.
   * @param config The JMAP transport configuration.
   * @since 0.4.0
   */
  constructor(config: JmapConfig) {
    this.config = createJmapConfig(config);
    this.httpClient = new JmapHttpClient(this.config);
  }

  /**
   * Sends a single email message.
   * @param message The message to send.
   * @param options Optional transport options.
   * @returns A receipt indicating success or failure.
   * @since 0.4.0
   */
  async send(message: Message, options?: TransportOptions): Promise<Receipt> {
    const signal = options?.signal;

    try {
      signal?.throwIfAborted();

      // Get or refresh session
      const session = await this.getSession(signal);
      signal?.throwIfAborted();

      // Get account ID
      const accountId = this.config.accountId ?? findMailAccount(session);
      if (!accountId) {
        return {
          successful: false,
          errorMessages: ["No mail-capable account found in JMAP session"],
        };
      }

      // Get drafts mailbox ID
      const draftsMailboxId = await this.getDraftsMailboxId(
        session,
        accountId,
        signal,
      );
      signal?.throwIfAborted();

      // Get identity ID
      const identityId = await this.getIdentityId(
        session,
        accountId,
        message.sender.address,
        signal,
      );
      signal?.throwIfAborted();

      // Upload attachments
      const uploadedBlobs = await this.uploadAttachments(
        session,
        accountId,
        message.attachments,
        signal,
      );
      signal?.throwIfAborted();

      // Convert message and send
      const emailCreate = convertMessage(
        message,
        draftsMailboxId,
        uploadedBlobs,
      );

      // Execute Email/set + EmailSubmission/set batch request
      const response = await this.httpClient.executeRequest(
        session.apiUrl,
        {
          using: [
            JMAP_CAPABILITIES.core,
            JMAP_CAPABILITIES.mail,
            JMAP_CAPABILITIES.submission,
          ],
          methodCalls: [
            [
              "Email/set",
              {
                accountId,
                create: { draft: emailCreate },
              },
              "c0",
            ],
            [
              "EmailSubmission/set",
              {
                accountId,
                create: {
                  submission: {
                    identityId,
                    emailId: "#draft",
                  },
                },
              },
              "c1",
            ],
          ],
        },
        signal,
      );

      // Parse response
      return this.parseResponse(response);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return {
          successful: false,
          errorMessages: [`Request aborted: ${error.message}`],
        };
      }

      if (error instanceof JmapApiError) {
        return {
          successful: false,
          errorMessages: [error.message],
        };
      }

      return {
        successful: false,
        errorMessages: [
          error instanceof Error ? error.message : String(error),
        ],
      };
    }
  }

  /**
   * Sends multiple messages in a single batched JMAP request.
   * @param messages The messages to send.
   * @param options Optional transport options.
   * @yields Receipts for each message.
   * @since 0.4.0
   */
  async *sendMany(
    messages: Iterable<Message> | AsyncIterable<Message>,
    options?: TransportOptions,
  ): AsyncIterable<Receipt> {
    const signal = options?.signal;

    // Collect all messages into an array first
    const messageArray: Message[] = [];
    for await (const message of messages) {
      messageArray.push(message);
    }

    // If no messages, return early
    if (messageArray.length === 0) {
      return;
    }

    // Track processing stage for better error messages
    let processingStage = "initialization";
    let attachmentsUploadedCount = 0;

    try {
      signal?.throwIfAborted();

      // Get or refresh session (once)
      processingStage = "session fetch";
      const session = await this.getSession(signal);
      signal?.throwIfAborted();

      // Get account ID (once)
      processingStage = "account discovery";
      const accountId = this.config.accountId ?? findMailAccount(session);
      if (!accountId) {
        for (let i = 0; i < messageArray.length; i++) {
          yield {
            successful: false,
            errorMessages: ["No mail-capable account found in JMAP session"],
          };
        }
        return;
      }

      // Get drafts mailbox ID (once)
      processingStage = "mailbox discovery";
      const draftsMailboxId = await this.getDraftsMailboxId(
        session,
        accountId,
        signal,
      );
      signal?.throwIfAborted();

      // Get identities (once) and build a map
      processingStage = "identity resolution";
      const identityMap = await this.getIdentityMap(session, accountId, signal);
      signal?.throwIfAborted();

      // Upload all attachments for all messages
      processingStage = "attachment upload";
      const allUploadedBlobs = new Map<number, Map<string, string>>();
      for (let i = 0; i < messageArray.length; i++) {
        const message = messageArray[i];
        const uploadedBlobs = await this.uploadAttachments(
          session,
          accountId,
          message.attachments,
          signal,
        );
        allUploadedBlobs.set(i, uploadedBlobs);
        attachmentsUploadedCount = i + 1;
        signal?.throwIfAborted();
      }

      // Build batch Email/set and EmailSubmission/set create objects
      processingStage = "message conversion";
      const emailCreates: Record<string, unknown> = {};
      const submissionCreates: Record<string, unknown> = {};

      for (let i = 0; i < messageArray.length; i++) {
        const message = messageArray[i];
        const uploadedBlobs = allUploadedBlobs.get(i)!;
        const emailCreate = convertMessage(
          message,
          draftsMailboxId,
          uploadedBlobs,
        );

        // Find identity for this sender
        const senderEmail = message.sender.address.toLowerCase();
        const identityId = identityMap.get(senderEmail) ??
          identityMap.values().next().value;

        emailCreates[`draft${i}`] = emailCreate;
        submissionCreates[`sub${i}`] = {
          identityId,
          emailId: `#draft${i}`,
        };
      }

      // Execute batch request
      processingStage = "batch request execution";
      const response = await this.httpClient.executeRequest(
        session.apiUrl,
        {
          using: [
            JMAP_CAPABILITIES.core,
            JMAP_CAPABILITIES.mail,
            JMAP_CAPABILITIES.submission,
          ],
          methodCalls: [
            [
              "Email/set",
              {
                accountId,
                create: emailCreates,
              },
              "c0",
            ],
            [
              "EmailSubmission/set",
              {
                accountId,
                create: submissionCreates,
              },
              "c1",
            ],
          ],
        },
        signal,
      );

      // Parse batch response and yield individual receipts
      for (let i = 0; i < messageArray.length; i++) {
        yield this.parseBatchResponseForIndex(response, i);
      }
    } catch (error) {
      // For any error during batch processing, yield failure for all messages
      // with detailed stage information
      const baseMessage = error instanceof Error && error.name === "AbortError"
        ? `Request aborted: ${error.message}`
        : error instanceof JmapApiError
        ? error.message
        : error instanceof Error
        ? error.message
        : String(error);

      // Build detailed error message with stage and progress info
      let detailedMessage = `Failed during ${processingStage}: ${baseMessage}`;
      if (
        processingStage === "attachment upload" && attachmentsUploadedCount > 0
      ) {
        detailedMessage +=
          ` (${attachmentsUploadedCount}/${messageArray.length} messages had attachments uploaded before failure)`;
      }

      for (let i = 0; i < messageArray.length; i++) {
        yield {
          successful: false,
          errorMessages: [detailedMessage],
        };
      }
    }
  }

  /**
   * Gets or refreshes the JMAP session.
   * @param signal Optional abort signal.
   * @returns The JMAP session.
   * @since 0.4.0
   */
  private async getSession(signal?: AbortSignal): Promise<JmapSession> {
    const now = Date.now();

    // Check cache
    if (
      this.cachedSession &&
      now - this.cachedSession.fetchedAt < this.config.sessionCacheTtl
    ) {
      return this.cachedSession.session;
    }

    // Fetch new session
    let session = await this.httpClient.fetchSession(signal);

    // Rewrite URLs if baseUrl is configured
    if (this.config.baseUrl) {
      session = this.rewriteSessionUrls(session);
    }

    // Cache it
    this.cachedSession = {
      session,
      fetchedAt: now,
    };

    return session;
  }

  /**
   * Rewrites session URLs to use the configured baseUrl.
   * @param session The original session from the server.
   * @returns A new session with rewritten URLs.
   * @since 0.4.0
   */
  private rewriteSessionUrls(session: JmapSession): JmapSession {
    const baseUrl = this.config.baseUrl!;

    const rewriteUrl = (url: string): string => {
      try {
        // Parse just the base URL to get the target protocol and host
        const base = new URL(baseUrl);
        // Use regex to replace the protocol and host, preserving templates like {accountId}
        return url.replace(
          /^(\w+):\/\/[^/]+/,
          `${base.protocol}//${base.host}`,
        );
      } catch {
        return url;
      }
    };

    return {
      ...session,
      apiUrl: rewriteUrl(session.apiUrl),
      downloadUrl: rewriteUrl(session.downloadUrl),
      uploadUrl: rewriteUrl(session.uploadUrl),
      eventSourceUrl: session.eventSourceUrl
        ? rewriteUrl(session.eventSourceUrl)
        : undefined,
    };
  }

  /**
   * Gets the drafts mailbox ID from the session.
   * @param session The JMAP session.
   * @param accountId The account ID.
   * @param signal Optional abort signal.
   * @returns The drafts mailbox ID.
   * @since 0.4.0
   */
  private async getDraftsMailboxId(
    session: JmapSession,
    accountId: string,
    signal?: AbortSignal,
  ): Promise<string> {
    const response = await this.httpClient.executeRequest(
      session.apiUrl,
      {
        using: [JMAP_CAPABILITIES.core, JMAP_CAPABILITIES.mail],
        methodCalls: [
          [
            "Mailbox/get",
            {
              accountId,
              properties: ["id", "role", "name"],
            },
            "c0",
          ],
        ],
      },
      signal,
    );

    const mailboxResponse = response.methodResponses.find(
      (r) => r[0] === "Mailbox/get",
    );

    if (!mailboxResponse) {
      throw new JmapApiError("No Mailbox/get response received");
    }

    const mailboxes =
      (mailboxResponse[1] as { list?: { id: string; role?: string }[] })
        .list;

    if (!mailboxes) {
      throw new JmapApiError("No mailboxes found");
    }

    // Find drafts mailbox
    const drafts = mailboxes.find((m) => m.role === "drafts");

    if (!drafts) {
      throw new JmapApiError("No drafts mailbox found");
    }

    return drafts.id;
  }

  /**
   * Gets the identity ID for the sender.
   * @param session The JMAP session.
   * @param accountId The account ID.
   * @param senderEmail The sender's email address.
   * @param signal Optional abort signal.
   * @returns The identity ID.
   * @since 0.4.0
   */
  private async getIdentityId(
    session: JmapSession,
    accountId: string,
    senderEmail: string,
    signal?: AbortSignal,
  ): Promise<string> {
    // If identity ID is configured, use it
    if (this.config.identityId) {
      return this.config.identityId;
    }

    const identityMap = await this.getIdentityMap(session, accountId, signal);
    const matching = identityMap.get(senderEmail.toLowerCase());
    if (matching) {
      return matching;
    }

    // Fall back to first identity
    return identityMap.values().next().value!;
  }

  /**
   * Gets all identities and builds a map of email to identity ID.
   * @param session The JMAP session.
   * @param accountId The account ID.
   * @param signal Optional abort signal.
   * @returns Map of lowercase email to identity ID.
   * @since 0.4.0
   */
  private async getIdentityMap(
    session: JmapSession,
    accountId: string,
    signal?: AbortSignal,
  ): Promise<Map<string, string>> {
    // If identity ID is configured, return a map with just that
    if (this.config.identityId) {
      return new Map([["*", this.config.identityId]]);
    }

    const response = await this.httpClient.executeRequest(
      session.apiUrl,
      {
        using: [JMAP_CAPABILITIES.core, JMAP_CAPABILITIES.submission],
        methodCalls: [
          [
            "Identity/get",
            {
              accountId,
            },
            "c0",
          ],
        ],
      },
      signal,
    );

    const identityResponse = response.methodResponses.find(
      (r) => r[0] === "Identity/get",
    );

    if (!identityResponse) {
      throw new JmapApiError("No Identity/get response received");
    }

    const identities =
      (identityResponse[1] as { list?: { id: string; email: string }[] })
        .list;

    if (!identities || identities.length === 0) {
      throw new JmapApiError("No identities found");
    }

    const identityMap = new Map<string, string>();
    for (const identity of identities) {
      identityMap.set(identity.email.toLowerCase(), identity.id);
    }

    return identityMap;
  }

  /**
   * Uploads all attachments and returns a map of contentId to blobId.
   * @param session The JMAP session.
   * @param accountId The account ID.
   * @param attachments Array of attachments to upload.
   * @param signal Optional abort signal.
   * @returns Map of contentId to blobId.
   * @since 0.4.0
   */
  private async uploadAttachments(
    session: JmapSession,
    accountId: string,
    attachments: readonly Attachment[],
    signal?: AbortSignal,
  ): Promise<Map<string, string>> {
    const uploadedBlobs = new Map<string, string>();

    for (const attachment of attachments) {
      signal?.throwIfAborted();

      // Resolve content if it's a promise
      const content = await attachment.content;

      // Create a Blob from the Uint8Array
      // Extract the ArrayBuffer portion to ensure TypeScript compatibility
      const arrayBuffer = content.buffer.slice(
        content.byteOffset,
        content.byteOffset + content.byteLength,
      ) as ArrayBuffer;
      const blob = new Blob([arrayBuffer], { type: attachment.contentType });

      const result = await uploadBlob(
        this.config,
        session.uploadUrl,
        accountId,
        blob,
        signal,
      );

      uploadedBlobs.set(attachment.contentId, result.blobId);
    }

    return uploadedBlobs;
  }

  /**
   * Parses the JMAP response to extract receipt information.
   * @param response The JMAP response.
   * @returns A receipt indicating success or failure.
   * @since 0.4.0
   */
  private parseResponse(response: JmapResponse): Receipt {
    const errors: string[] = [];

    // Check Email/set response
    const emailResponse = response.methodResponses.find(
      (r) => r[0] === "Email/set",
    );

    if (emailResponse) {
      const emailResult = emailResponse[1] as {
        created?: Record<string, { id: string }>;
        notCreated?: Record<string, { type: string; description?: string }>;
      };

      if (emailResult.notCreated) {
        for (const [key, error] of Object.entries(emailResult.notCreated)) {
          errors.push(
            `Email creation failed (${key}): ${error.type}${
              error.description ? ` - ${error.description}` : ""
            }`,
          );
        }
      }
    }

    // Check EmailSubmission/set response
    const submissionResponse = response.methodResponses.find(
      (r) => r[0] === "EmailSubmission/set",
    );

    if (submissionResponse) {
      const submissionResult = submissionResponse[1] as {
        created?: Record<string, { id: string }>;
        notCreated?: Record<string, { type: string; description?: string }>;
      };

      if (submissionResult.notCreated) {
        for (
          const [key, error] of Object.entries(submissionResult.notCreated)
        ) {
          errors.push(
            `Email submission failed (${key}): ${error.type}${
              error.description ? ` - ${error.description}` : ""
            }`,
          );
        }
      }

      // Success case
      if (submissionResult.created?.submission) {
        return {
          successful: true,
          messageId: submissionResult.created.submission.id,
        };
      }
    }

    // If no errors but no success either, something is wrong
    if (errors.length === 0) {
      errors.push("Unknown error: No submission result received");
    }

    return {
      successful: false,
      errorMessages: errors,
    };
  }

  /**
   * Parses the JMAP batch response to extract receipt for a specific index.
   * @param response The JMAP response.
   * @param index The message index in the batch.
   * @returns A receipt indicating success or failure for that message.
   * @since 0.4.0
   */
  private parseBatchResponseForIndex(
    response: JmapResponse,
    index: number,
  ): Receipt {
    const errors: string[] = [];
    const draftKey = `draft${index}`;
    const subKey = `sub${index}`;

    // Check Email/set response
    const emailResponse = response.methodResponses.find(
      (r) => r[0] === "Email/set",
    );

    if (emailResponse) {
      const emailResult = emailResponse[1] as {
        created?: Record<string, { id: string }>;
        notCreated?: Record<string, { type: string; description?: string }>;
      };

      if (emailResult.notCreated?.[draftKey]) {
        const error = emailResult.notCreated[draftKey];
        errors.push(
          `Email creation failed: ${error.type}${
            error.description ? ` - ${error.description}` : ""
          }`,
        );
      }
    }

    // Check EmailSubmission/set response
    const submissionResponse = response.methodResponses.find(
      (r) => r[0] === "EmailSubmission/set",
    );

    if (submissionResponse) {
      const submissionResult = submissionResponse[1] as {
        created?: Record<string, { id: string }>;
        notCreated?: Record<string, { type: string; description?: string }>;
      };

      if (submissionResult.notCreated?.[subKey]) {
        const error = submissionResult.notCreated[subKey];
        errors.push(
          `Email submission failed: ${error.type}${
            error.description ? ` - ${error.description}` : ""
          }`,
        );
      }

      // Success case
      if (submissionResult.created?.[subKey]) {
        return {
          successful: true,
          messageId: submissionResult.created[subKey].id,
        };
      }
    }

    // If no errors but no success either
    if (errors.length === 0) {
      errors.push("Unknown error: No submission result received");
    }

    return {
      successful: false,
      errorMessages: errors,
    };
  }
}

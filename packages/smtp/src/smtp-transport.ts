import {
  prepareRawSmtpMessage,
  Smtp8BitMimeUnsupportedError,
} from "./raw-message.ts";
import {
  createFailedReceipt,
  createRawMessagePlan,
  type Message,
  type RawMessage,
  RawMessageValidationError,
  type RawTransport,
  type Receipt,
  type TransportOptions,
  type VerifiableTransport,
} from "@upyo/core";
import type { SmtpConfig } from "./config.ts";
import {
  resolveSmtpDsn,
  SmtpDsnUnsupportedError,
  SmtpDsnValidationError,
  type SmtpRawTransportOptions,
  type SmtpTransportOptions,
} from "./delivery-status.ts";
import {
  SmtpAuthResponseError,
  SmtpConnection,
  SmtpMessageSizeError,
  SmtpResponseError,
  SmtpUtf8UnsupportedError,
} from "./smtp-connection.ts";
import {
  type ResolvedSmtpEnvelope,
  resolveSmtpEnvelope,
  type SmtpEnvelopeOptions,
  type SmtpEnvelopeResolver,
  SmtpEnvelopeValidationError,
} from "./envelope.ts";
import { OAuth2TokenManager } from "./oauth2.ts";
import { prepareMessage } from "./message-converter.ts";
import { SmtpAttachmentReplayError } from "./message-stream.ts";
import { validateDkimBodyMode } from "@upyo/mime/internal";
import type { SmtpEnhancedStatusCode, SmtpReceipt } from "./smtp-receipt.ts";
import { parseEnhancedSmtpStatusCode } from "./smtp-status-code.ts";

/**
 * SMTP transport implementation for sending emails via SMTP protocol.
 *
 * This transport provides efficient email delivery with connection pooling,
 * support for authentication, TLS/SSL encryption, and batch sending capabilities.
 *
 * @example
 * ```typescript
 * import { SmtpTransport } from '@upyo/smtp';
 *
 * // Automatic resource cleanup with using statement
 * await using transport = new SmtpTransport({
 *   host: 'smtp.gmail.com',
 *   port: 465,
 *   secure: true, // Use TLS from start
 *   auth: {
 *     user: 'user@gmail.com',
 *     pass: 'app-password'
 *   }
 * });
 *
 * const receipt = await transport.send(message);
 * // Connections are automatically closed here
 *
 * // Or manual management
 * const transport2 = new SmtpTransport(config);
 * try {
 *   await transport2.send(message);
 * } finally {
 *   await transport2.closeAllConnections();
 * }
 * ```
 */
export class SmtpTransport
  implements
    RawTransport<"smtp">,
    VerifiableTransport<"smtp">,
    AsyncDisposable {
  readonly id = "smtp";

  /**
   * The SMTP configuration used by this transport.
   */
  config: SmtpConfig;

  /**
   * The maximum number of SMTP connections this transport may have open at
   * once.  The limit covers connections that are being established,
   * connections that are currently sending, and idle connections retained for
   * reuse, so it holds whether or not pooling is enabled.  A caller that needs
   * a connection while the limit is reached waits until one becomes available.
   * `Infinity` leaves the number of connections unbounded.
   */
  poolSize: number;

  /**
   * Idle connections retained for reuse.  Every connection in here also counts
   * towards {@link openConnectionCount}, so the pool can never grow past
   * {@link poolSize}.
   */
  private connectionPool: SmtpConnection[] = [];

  /**
   * The number of connections this transport currently owns: connections being
   * established, connections checked out by a caller, and idle connections in
   * {@link connectionPool}.  Never exceeds {@link poolSize}.
   */
  private openConnectionCount = 0;

  /**
   * Callers waiting for a connection to become available, in arrival order.
   */
  private capacityWaiters: CapacityWaiter[] = [];

  /** The current shutdown barrier; new callers wait until it completes. */
  private closing: Promise<void> | undefined;
  private pendingAcquisitions = 0;
  private onDrained: (() => void) | undefined;

  /**
   * A token manager shared across all pooled connections, present only when the
   * configured authentication uses OAuth 2.0.  Sharing it ensures the
   * refresh-token exchange happens at most once per token lifetime instead of
   * once per connection.
   */
  private readonly tokenManager: OAuth2TokenManager | undefined;

  /**
   * Creates a new SMTP transport instance.
   *
   * @param config SMTP configuration including server details, authentication,
   *               and options.
   * @throws {RangeError} If `config.poolSize` is neither a positive integer nor
   *                        `Infinity`.
   */
  constructor(config: SmtpConfig) {
    validateDkimBodyMode(config.dkim);
    this.config = config;
    const poolSize = config.poolSize ?? 5;
    if (
      Number.isNaN(poolSize) || poolSize < 1 ||
      (Number.isFinite(poolSize) && !Number.isInteger(poolSize))
    ) {
      throw new RangeError(
        `poolSize must be a positive integer or Infinity: ${poolSize}`,
      );
    }
    this.poolSize = poolSize;
    const auth = config.auth;
    this.tokenManager =
      auth != null && ("accessToken" in auth || "refreshToken" in auth)
        ? new OAuth2TokenManager(auth)
        : undefined;
  }

  /**
   * Checks a fresh SMTP connection, TLS policy, and configured authentication
   * without sending mail. Uses the shared connection limit and closes the
   * verification connection afterward, even when pooling is enabled.
   * Success does not guarantee acceptance of a sender, recipient, or message.
   * @param options Optional cancellation signal, including while waiting for capacity.
   * @returns A promise that resolves after successful verification and cleanup.
   * @throws {SmtpResponseError} If greeting, EHLO/HELO, or STARTTLS is rejected.
   * @throws {SmtpAuthError} If authentication fails.
   * @throws {Error} If a connection, TLS, or timeout error occurs.
   * @throws The caller's abort reason if cancelled.
   * @since 0.6.0
   */
  async verify(options?: TransportOptions): Promise<void> {
    const signal = options?.signal;
    signal?.throwIfAborted();
    let connection: SmtpConnection | undefined;
    try {
      connection = await this.getConnection(signal, true);
      signal?.throwIfAborted();
    } catch (error) {
      signal?.throwIfAborted();
      throw error;
    } finally {
      if (connection != null) await this.discardConnection(connection, signal);
    }
    signal?.throwIfAborted();
  }

  /**
   * Sends a single email message via SMTP.
   *
   * This method converts the message to SMTP format, establishes a connection
   * to the SMTP server, sends the message, and returns a receipt with the result.
   *
   * @example
   * ```typescript
   * const receipt = await transport.send({
   *   sender: { address: 'from@example.com' },
   *   recipients: [{ address: 'to@example.com' }],
   *   subject: 'Hello',
   *   content: { text: 'Hello World!' }
   * });
   *
   * if (receipt.successful) {
   *   console.log('Message sent with ID:', receipt.messageId);
   * }
   * ```
   *
   * @param message The email message to send.
   * @param options Optional SMTP envelope, delivery status, and cancellation
   *                settings.
   * @returns A promise that resolves to a receipt indicating success or
   *          failure.
   * @throws {DOMException} If the operation is aborted through
   *                        `options.signal`.
   */
  async send(
    message: Message,
    options?: SmtpTransportOptions,
  ): Promise<SmtpReceipt> {
    options?.signal?.throwIfAborted();

    let connection: SmtpConnection | undefined;

    try {
      const envelope = resolveEnvelopeOption(message, options?.envelope, 0);
      const dsn = resolveSmtpDsn(envelope, options?.dsn);

      // Establishing the connection—including authentication, e.g. acquiring an
      // OAuth 2.0 access token—is part of delivery, so setup failures are
      // reported as a failed receipt rather than thrown.  (Cancellation via the
      // abort signal still rejects: an already-aborted signal is caught by the
      // guard above, before this method does any work.)
      connection = await this.getConnection(options?.signal);

      options?.signal?.throwIfAborted();

      const smtpMessage = prepareMessage(
        message,
        this.config.dkim,
        dsn,
        envelope,
      );

      options?.signal?.throwIfAborted();

      const result = await connection.sendMessage(
        smtpMessage,
        options?.signal,
      );

      await this.returnConnection(connection);
      // Cleared so the catch below cannot hand the same connection back twice.
      connection = undefined;

      return {
        successful: true,
        messageId: result.messageId,
        provider: "smtp",
        rejectedRecipients: result.rejectedRecipients,
      };
    } catch (error) {
      if (connection != null) {
        if (connection.usable && isReusableLocalFailure(error)) {
          await this.returnConnection(connection);
        } else {
          await this.discardConnection(connection);
        }
      }

      // Cancellation rejects rather than producing a receipt.
      options?.signal?.throwIfAborted();

      return createSmtpFailure(
        error instanceof Error ? error.message : String(error),
        error,
      );
    }
  }

  /**
   * Delivers serialized MIME unchanged, apart from SMTP dot-stuffing.
   * Configured DKIM signing and message composition are bypassed.
   * @param message Original MIME bytes and explicit delivery envelope.
   * @param options Optional DSN and cancellation settings.
   * @returns An SMTP receipt, including any rejected recipients.
   * @throws {Error} If cancellation is requested.
   * @since 0.6.0
   */
  async sendRaw(
    message: RawMessage,
    options?: SmtpRawTransportOptions,
  ): Promise<SmtpReceipt> {
    if (message?.content instanceof Promise) message.content.catch(() => {});
    options?.signal?.throwIfAborted();
    let connection: SmtpConnection | undefined;
    try {
      const plan = createRawMessagePlan(message);
      if (options?.envelope !== undefined) {
        throw new SmtpEnvelopeValidationError(
          "Raw message envelopes cannot be overridden.",
        );
      }
      const dsn = resolveSmtpDsn(plan.envelope, options?.dsn);
      connection = await this.getConnection(options?.signal);
      const result = await connection.sendMessage(
        prepareRawSmtpMessage(plan, dsn),
        options?.signal,
      );
      await this.returnConnection(connection);
      connection = undefined;
      return {
        successful: true,
        provider: "smtp",
        messageId: result.messageId,
        rejectedRecipients: result.rejectedRecipients,
      };
    } catch (error) {
      if (connection != null) {
        if (connection.usable && isReusableLocalFailure(error)) {
          await this.returnConnection(connection);
        } else {
          await this.discardConnection(connection);
        }
      }
      options?.signal?.throwIfAborted();
      return createSmtpFailure(
        error instanceof Error ? error.message : String(error),
        error,
      );
    }
  }

  /**
   * Sends multiple email messages efficiently using a single SMTP connection.
   *
   * This method is optimized for bulk email sending by reusing a single SMTP
   * connection for all messages, which significantly improves performance
   * compared to sending each message individually.
   *
   * @example
   * ```typescript
   * const messages = [
   *   { subject: 'Message 1', recipients: [{ address: 'user1@example.com' }], ... },
   *   { subject: 'Message 2', recipients: [{ address: 'user2@example.com' }], ... }
   * ];
   *
   * for await (const receipt of transport.sendMany(messages)) {
   *   if (receipt.successful) {
   *     console.log('Sent:', receipt.messageId);
   *   } else {
   *     console.error('Failed:', receipt.errorMessages);
   *   }
   * }
   * ```
   *
   * @param messages An iterable or async iterable of messages to send.
   * @param options Optional SMTP envelope, delivery status, and cancellation
   *                settings.
   * @returns An async iterable of receipts, one for each message.
   * @throws {DOMException} If the operation is aborted through
   *                        `options.signal`.
   */
  async *sendMany(
    messages: Iterable<Message> | AsyncIterable<Message>,
    options?: SmtpTransportOptions,
  ): AsyncIterable<SmtpReceipt> {
    options?.signal?.throwIfAborted();

    let connection: SmtpConnection;
    try {
      connection = await this.getConnection(options?.signal);
    } catch (error) {
      // Cancellation rejects rather than producing receipts.
      options?.signal?.throwIfAborted();

      // Connection setup (including authentication) failed, so no message can
      // be delivered.  Report a failed receipt for each message rather than
      // throwing.
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);
      for await (const _ of messages) {
        options?.signal?.throwIfAborted();
        yield createSmtpFailure(errorMessage, error);
      }
      return;
    }

    let connectionValid = true;
    let connectionReleased = false;

    const releaseConnection = async (): Promise<void> => {
      if (connectionReleased) return;
      connectionReleased = true;
      if (connectionValid) {
        await this.returnConnection(connection);
      } else {
        await this.discardConnection(connection);
      }
    };

    try {
      const isAsyncIterable = Symbol.asyncIterator in messages;

      if (isAsyncIterable) {
        let index = 0;
        for await (const message of messages as AsyncIterable<Message>) {
          options?.signal?.throwIfAborted();

          if (!connectionValid) {
            yield createSmtpFailure("Connection is no longer valid");
            continue;
          }

          try {
            const envelope = resolveEnvelopeOption(
              message,
              options?.envelope,
              index++,
            );
            const dsn = resolveSmtpDsn(envelope, options?.dsn);
            const smtpMessage = prepareMessage(
              message,
              this.config.dkim,
              dsn,
              envelope,
            );
            options?.signal?.throwIfAborted();

            const result = await connection.sendMessage(
              smtpMessage,
              options?.signal,
            );

            yield {
              successful: true,
              messageId: result.messageId,
              provider: "smtp",
              rejectedRecipients: result.rejectedRecipients,
            };
          } catch (error) {
            // Cancellation rejects rather than producing a receipt.
            options?.signal?.throwIfAborted();

            if (!connection.usable || !isReusableLocalFailure(error)) {
              connectionValid = false;
            }

            yield createSmtpFailure(
              error instanceof Error ? error.message : String(error),
              error,
            );
          }
        }
      } else {
        let index = 0;
        for (const message of messages as Iterable<Message>) {
          options?.signal?.throwIfAborted();

          if (!connectionValid) {
            yield createSmtpFailure("Connection is no longer valid");
            continue;
          }

          try {
            const envelope = resolveEnvelopeOption(
              message,
              options?.envelope,
              index++,
            );
            const dsn = resolveSmtpDsn(envelope, options?.dsn);
            const smtpMessage = prepareMessage(
              message,
              this.config.dkim,
              dsn,
              envelope,
            );
            options?.signal?.throwIfAborted();

            const result = await connection.sendMessage(
              smtpMessage,
              options?.signal,
            );

            yield {
              successful: true,
              messageId: result.messageId,
              provider: "smtp",
              rejectedRecipients: result.rejectedRecipients,
            };
          } catch (error) {
            // Cancellation rejects rather than producing a receipt.
            options?.signal?.throwIfAborted();

            if (!connection.usable || !isReusableLocalFailure(error)) {
              connectionValid = false;
            }

            yield createSmtpFailure(
              error instanceof Error ? error.message : String(error),
              error,
            );
          }
        }
      }
    } catch (error) {
      // Error during iteration setup or while reading the messages
      connectionValid = false;
      throw error;
    } finally {
      // Runs on normal completion, on error, and when the consumer abandons
      // the iteration early with `break` or `return`.  Without it an abandoned
      // iteration would hold its connection slot forever.
      await releaseConnection();
    }
  }

  /**
   * Checks out a connection, waiting when {@link poolSize} connections are
   * already open.  The returned connection holds one of those slots until it is
   * handed back through {@link returnConnection} or {@link discardConnection}.
   *
   * @param signal Signal that cancels the wait for a free connection.
   * @param fresh Whether setup must run on a new connection.
   * @returns A connection ready to send.
   * @throws {DOMException} If `signal` is aborted before a connection is
   *                        obtained.
   */
  private async getConnection(
    signal?: AbortSignal,
    fresh = false,
  ): Promise<SmtpConnection> {
    signal?.throwIfAborted();
    while (this.closing != null) {
      await this.waitForShutdown(this.closing, signal);
      signal?.throwIfAborted();
    }
    this.pendingAcquisitions++;
    try {
      return await this.acquireConnection(signal, fresh);
    } finally {
      this.pendingAcquisitions--;
      this.notifyDrained();
    }
  }

  private waitForShutdown(
    closing: Promise<void>,
    signal?: AbortSignal,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        signal?.removeEventListener("abort", onAbort);
        reject(signal?.reason);
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      closing.then(() => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      });
    });
  }

  private notifyDrained(): void {
    if (this.openConnectionCount === 0 && this.pendingAcquisitions === 0) {
      this.onDrained?.();
    }
  }

  private async acquireConnection(
    signal?: AbortSignal,
    fresh = false,
  ): Promise<SmtpConnection> {
    while (true) {
      signal?.throwIfAborted();
      if (fresh && this.openConnectionCount >= this.poolSize) {
        const idle = this.connectionPool.pop();
        if (idle != null) {
          // Transfer this slot without waking a competing acquisition.
          await this.closeConnection(idle, signal);
          return await this.setupReservedConnection(signal);
        }
      }
      // Reuse an idle connection when the pool has one.  It already holds a
      // slot, so nothing else needs to be reserved.
      let pooled = fresh ? undefined : this.connectionPool.pop();
      while (pooled != null) {
        if (pooled.usable) return pooled;
        // Dropping a connection that went stale in the pool frees its slot.
        await this.discardConnection(pooled);
        pooled = this.connectionPool.pop();
      }

      if (this.openConnectionCount < this.poolSize) {
        // Reserve the slot before connecting so that connections still being
        // established count towards the limit.
        this.openConnectionCount++;
        return await this.setupReservedConnection(signal);
      }

      // Every slot is taken, so wait for one to come back.
      await this.waitForCapacity(signal);
      try {
        signal?.throwIfAborted();
      } catch (error) {
        // This caller consumed a wake-up it can no longer use; pass it on so
        // that a waiter behind it is not stranded.
        this.wakeCapacityWaiter();
        throw error;
      }
    }
  }

  /** Establishes a connection using a slot already owned by this acquisition. */
  private async setupReservedConnection(
    signal?: AbortSignal,
  ): Promise<SmtpConnection> {
    let connection: SmtpConnection | undefined;
    try {
      signal?.throwIfAborted();
      connection = new SmtpConnection(this.config, this.tokenManager);
      await this.connectAndSetup(connection, signal);
      signal?.throwIfAborted();
      return connection;
    } catch (error) {
      if (connection != null) await this.closeConnection(connection, signal);
      this.releaseConnectionSlot();
      throw error;
    }
  }

  /**
   * Waits until {@link wakeCapacityWaiter} reports that a connection or a free
   * slot may be available.
   *
   * @param signal Signal that cancels the wait.
   * @returns A promise that resolves when the caller should retry.
   * @throws {DOMException} If `signal` is aborted while waiting.
   */
  private waitForCapacity(signal?: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const waiters = this.capacityWaiters;
      const onAbort = () => {
        // Dropping the waiter from the queue before rejecting keeps it from
        // consuming a wake-up meant for someone still waiting.
        const index = waiters.indexOf(waiter);
        if (index >= 0) waiters.splice(index, 1);
        waiter.reject(signal?.reason);
      };
      const waiter: CapacityWaiter = {
        resolve: () => {
          signal?.removeEventListener("abort", onAbort);
          resolve();
        },
        reject: (reason) => {
          signal?.removeEventListener("abort", onAbort);
          reject(reason);
        },
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      waiters.push(waiter);
    });
  }

  /** Wakes the caller that has been waiting longest, if there is one. */
  private wakeCapacityWaiter(): void {
    this.capacityWaiters.shift()?.resolve();
  }

  /**
   * Gives up the slot held by a connection that is no longer open, letting a
   * waiting caller take its place.
   */
  private releaseConnectionSlot(): void {
    this.openConnectionCount--;
    this.wakeCapacityWaiter();
    this.notifyDrained();
  }

  private async connectAndSetup(
    connection: SmtpConnection,
    signal?: AbortSignal,
  ): Promise<void> {
    signal?.throwIfAborted();

    await connection.connect(signal);

    signal?.throwIfAborted();

    // Wait for server greeting
    const greeting = await connection.greeting(signal);
    if (greeting.code !== 220) {
      throw new SmtpResponseError(
        `Server greeting failed: ${greeting.message}`,
        greeting.code,
        "GREETING",
        greeting.message,
      );
    }

    signal?.throwIfAborted();

    // Send EHLO
    await connection.ehlo(signal);

    signal?.throwIfAborted();

    // Perform STARTTLS for plaintext connections when either the server
    // advertises it or the caller requires it.  A required upgrade is attempted
    // even without the capability so STARTTLS stripping fails closed.
    if (
      connection.config.secure === false &&
      (connection.config.requireTls === true ||
        connection.capabilities.some((cap) =>
          cap.toUpperCase().startsWith("STARTTLS")
        ))
    ) {
      await connection.starttls(signal);

      signal?.throwIfAborted();

      // RFC 3207: Client SHOULD send EHLO after successful TLS negotiation
      // to get updated capabilities (including AUTH)
      await connection.ehlo(signal);

      signal?.throwIfAborted();
    }

    // Authenticate if needed
    await connection.authenticate(signal);
  }

  /**
   * Hands a connection back after a successful send, either retaining it for
   * reuse or closing it.  Either way the slot it occupies is passed on to a
   * waiting caller.
   */
  private async returnConnection(connection: SmtpConnection): Promise<void> {
    if (
      !connection.usable || !connection.config.pool || this.closing != null
    ) {
      await this.discardConnection(connection);
      return;
    }

    try {
      await connection.reset();
    } catch {
      // A connection that cannot be reset is not safe to reuse.
      await this.discardConnection(connection);
      return;
    }

    // Shutdown may have started while RSET was awaiting its reply.
    if (this.closing != null) {
      await this.discardConnection(connection);
      return;
    }

    // The connection keeps its slot while it sits idle, so no separate check
    // against `poolSize` is needed here: at most `poolSize` connections can be
    // checked out at once, hence at most `poolSize` can ever be returned.
    this.connectionPool.push(connection);
    this.wakeCapacityWaiter();
  }

  /**
   * Closes a connection without giving up the caller's reserved slot.
   */
  private async closeConnection(
    connection: SmtpConnection,
    signal?: AbortSignal,
  ): Promise<void> {
    try {
      await connection.quit(signal);
    } catch {
      // Ignore errors during cleanup
    }
  }

  /** Closes a connection and releases its slot exactly once. */
  private async discardConnection(
    connection: SmtpConnection,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.closeConnection(connection, signal);
    this.releaseConnectionSlot();
  }

  /**
   * Closes idle connections and drains sends and verification admitted before
   * this call.
   *
   * Resolves once those sends have released their connections and all their
   * sockets have closed.  Delivery is not interrupted, including sends waiting
   * for capacity or connection setup.  A started `sendMany()` iteration must
   * finish or be returned by its consumer before shutdown can complete.
   *
   * Concurrent close calls share the shutdown. New sends and verification wait for it to
   * finish (and can cancel that wait through their abort signal); the transport
   * can be reused afterward.
   *
   * @returns A promise that resolves after the admitted work is drained.
   *
   * @example
   * ```typescript
   * // At application shutdown
   * await transport.closeAllConnections();
   * ```
   */
  async closeAllConnections(): Promise<void> {
    if (this.closing != null) return this.closing;

    let drained!: () => void;
    const shutdown = new Promise<void>((resolve) => {
      drained = resolve;
    });
    this.onDrained = drained;
    this.closing = shutdown.then(() => {
      this.onDrained = undefined;
      this.closing = undefined;
    });
    const closing = this.closing;
    const connections = this.connectionPool;
    this.connectionPool = [];

    // Slots remain reserved until their sockets close.  Previously admitted
    // capacity waiters may then send, but must discard their connections too.
    await Promise.all(
      connections.map((connection) => this.discardConnection(connection)),
    );
    this.notifyDrained();
    await closing;
  }

  /**
   * Implements AsyncDisposable interface for automatic resource cleanup.
   *
   * This method is called automatically when using the `using` keyword,
   * ensuring that all SMTP connections are properly closed when the
   * transport goes out of scope.  Like {@link closeAllConnections}, it waits
   * for admitted sends and started batch iterations to release their connections.
   *
   * @example
   * ```typescript
   * // Automatic cleanup with using statement
   * await using transport = new SmtpTransport(config);
   * await transport.send(message);
   * // Connections are automatically closed here
   * ```
   */
  async [Symbol.asyncDispose](): Promise<void> {
    await this.closeAllConnections();
  }
}

/**
 * A caller parked in {@link SmtpTransport.waitForCapacity} until a connection
 * or a free connection slot becomes available.
 */
interface CapacityWaiter {
  readonly resolve: () => void;
  readonly reject: (reason: unknown) => void;
}

function createSmtpFailure(
  message: string,
  error?: unknown,
): Receipt<"smtp"> & { readonly successful: false } {
  if (error instanceof RawMessageValidationError) {
    return createFailedReceipt(message, {
      provider: "smtp",
      category: "validation",
      retryable: false,
      attempts: 1,
      code: error.field === "envelope"
        ? "smtp.envelope-invalid"
        : "smtp.raw-message-invalid",
    });
  }
  if (error instanceof Smtp8BitMimeUnsupportedError) {
    return createFailedReceipt(message, {
      provider: "smtp",
      category: "configuration",
      retryable: false,
      attempts: 1,
      code: "smtp.8bitmime-unsupported",
      providerDetails: { missingCapability: "8BITMIME" },
    });
  }
  if (error instanceof SmtpEnvelopeValidationError) {
    return createFailedReceipt(message, {
      provider: "smtp",
      code: "smtp.envelope-invalid",
      category: "validation",
      retryable: false,
      attempts: 1,
    });
  }

  if (error instanceof SmtpDsnValidationError) {
    return createFailedReceipt(message, {
      provider: "smtp",
      code: "smtp.dsn-invalid",
      category: "validation",
      retryable: false,
      attempts: 1,
    });
  }

  if (error instanceof SmtpDsnUnsupportedError) {
    return createFailedReceipt(message, {
      provider: "smtp",
      code: "smtp.dsn-unsupported",
      category: "configuration",
      retryable: false,
      attempts: 1,
    });
  }

  if (error instanceof SmtpAttachmentReplayError) {
    return createFailedReceipt(message, {
      provider: "smtp",
      code: "smtp.attachment-replay-mismatch",
      category: "validation",
      retryable: false,
      attempts: 1,
    });
  }

  if (error instanceof SmtpMessageSizeError) {
    return createFailedReceipt(message, {
      provider: "smtp",
      code: "smtp.message-size-exceeded",
      category: "rejected",
      retryable: false,
      attempts: 1,
      providerDetails: {
        actualSize: error.actualSize,
        maximumSize: error.maximumSize.toString(),
      },
    });
  }

  if (error instanceof SmtpUtf8UnsupportedError) {
    return createFailedReceipt(message, {
      provider: "smtp",
      code: "smtp.smtputf8-unsupported",
      category: "configuration",
      retryable: false,
      attempts: 1,
      providerDetails: {
        missingCapability: error.missingCapability,
      },
    });
  }

  if (
    error instanceof SmtpResponseError ||
    error instanceof SmtpAuthResponseError
  ) {
    const enhancedStatusCode = parseEnhancedSmtpStatusCode(
      error.code,
      error.response,
    );
    const classification = classifySmtpReply(error.code, enhancedStatusCode);
    return createFailedReceipt(message, {
      provider: "smtp",
      code: `smtp.${error.code}`,
      category: classification.category,
      retryable: classification.retryable,
      attempts: 1,
      providerDetails: {
        command: error.command,
        response: error.response,
        rejectedRecipients: error instanceof SmtpResponseError
          ? error.rejectedRecipients
          : undefined,
        ...(enhancedStatusCode == null ? {} : { enhancedStatusCode }),
      },
    });
  }

  return createFailedReceipt(message, {
    provider: "smtp",
    attempts: 1,
  });
}

function isReusableLocalFailure(error: unknown): boolean {
  return (error instanceof SmtpMessageSizeError &&
    error.phase === "preflight") ||
    error instanceof SmtpUtf8UnsupportedError ||
    error instanceof Smtp8BitMimeUnsupportedError ||
    error instanceof RawMessageValidationError ||
    error instanceof SmtpEnvelopeValidationError ||
    error instanceof SmtpDsnValidationError ||
    error instanceof SmtpDsnUnsupportedError;
}

function resolveEnvelopeOption(
  message: Message,
  option: SmtpEnvelopeOptions | SmtpEnvelopeResolver | undefined,
  index: number,
): ResolvedSmtpEnvelope {
  let override: SmtpEnvelopeOptions | undefined;
  if (typeof option === "function") {
    try {
      override = option(message, index);
    } catch (error) {
      const failure = new SmtpEnvelopeValidationError(
        `SMTP envelope resolver failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      failure.cause = error;
      throw failure;
    }
  } else {
    override = option;
  }
  return resolveSmtpEnvelope(message, override);
}

function classifySmtpReply(
  code: number,
  enhancedStatusCode?: SmtpEnhancedStatusCode,
): {
  readonly category:
    | "network"
    | "validation"
    | "rejected"
    | "service-unavailable"
    | "unknown";
  readonly retryable: boolean;
} {
  const retryable = enhancedStatusCode == null
    ? code >= 400 && code < 500
    : enhancedStatusCode.class === 4;

  if (
    enhancedStatusCode?.subject === 1 ||
    enhancedStatusCode?.subject === 6
  ) {
    return { category: "validation", retryable };
  }
  if (enhancedStatusCode?.subject === 4) {
    return { category: "network", retryable };
  }
  if (code >= 400 && code < 500) {
    return { category: "service-unavailable", retryable };
  }
  if (code >= 500 && code < 600) {
    return { category: "rejected", retryable };
  }
  return { category: "unknown", retryable: false };
}

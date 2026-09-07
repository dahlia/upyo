import {
  createFailedReceipt,
  type Message,
  type Receipt,
  type Transport,
  type TransportOptions,
} from "@upyo/core";
import type { SmtpConfig } from "./config.ts";
import { SmtpConnection, SmtpResponseError } from "./smtp-connection.ts";
import { OAuth2TokenManager } from "./oauth2.ts";
import { convertMessage } from "./message-converter.ts";
import type { SmtpReceipt } from "./smtp-receipt.ts";

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
export class SmtpTransport implements Transport<"smtp">, AsyncDisposable {
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
   * @param options Optional transport options including `AbortSignal` for
   *                cancellation.
   * @returns A promise that resolves to a receipt indicating success or
   *          failure.
   * @throws {DOMException} If the operation is aborted through
   *                        `options.signal`.
   */
  async send(
    message: Message,
    options?: TransportOptions,
  ): Promise<SmtpReceipt> {
    options?.signal?.throwIfAborted();

    let connection: SmtpConnection | undefined;

    try {
      // Establishing the connection—including authentication, e.g. acquiring an
      // OAuth 2.0 access token—is part of delivery, so setup failures are
      // reported as a failed receipt rather than thrown.  (Cancellation via the
      // abort signal still rejects: an already-aborted signal is caught by the
      // guard above, before this method does any work.)
      connection = await this.getConnection(options?.signal);

      options?.signal?.throwIfAborted();

      const smtpMessage = await convertMessage(message, this.config.dkim);

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
        await this.discardConnection(connection);
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
   * @param options Optional transport options including `AbortSignal` for
   *                cancellation.
   * @returns An async iterable of receipts, one for each message.
   * @throws {DOMException} If the operation is aborted through
   *                        `options.signal`.
   */
  async *sendMany(
    messages: Iterable<Message> | AsyncIterable<Message>,
    options?: TransportOptions,
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
        for await (const message of messages as AsyncIterable<Message>) {
          options?.signal?.throwIfAborted();

          if (!connectionValid) {
            yield createSmtpFailure("Connection is no longer valid");
            continue;
          }

          try {
            const smtpMessage = await convertMessage(message, this.config.dkim);
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

            // Mark connection as invalid on any error
            connectionValid = false;

            yield createSmtpFailure(
              error instanceof Error ? error.message : String(error),
              error,
            );
          }
        }
      } else {
        for (const message of messages as Iterable<Message>) {
          options?.signal?.throwIfAborted();

          if (!connectionValid) {
            yield createSmtpFailure("Connection is no longer valid");
            continue;
          }

          try {
            const smtpMessage = await convertMessage(message, this.config.dkim);
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

            // Mark connection as invalid on any error
            connectionValid = false;

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
   * @returns A connection ready to send.
   * @throws {DOMException} If `signal` is aborted before a connection is
   *                        obtained.
   */
  private async getConnection(signal?: AbortSignal): Promise<SmtpConnection> {
    signal?.throwIfAborted();

    while (true) {
      // Reuse an idle connection when the pool has one.  It already holds a
      // slot, so nothing else needs to be reserved.
      const pooled = this.connectionPool.pop();
      if (pooled != null) return pooled;

      if (this.openConnectionCount < this.poolSize) {
        // Reserve the slot before connecting so that connections still being
        // established count towards the limit.
        this.openConnectionCount++;
        const connection = new SmtpConnection(this.config, this.tokenManager);
        try {
          await this.connectAndSetup(connection, signal);
        } catch (error) {
          // Setup failed after the socket may have opened (e.g. EHLO,
          // STARTTLS, or authentication failure); discard it so neither the
          // socket nor its slot leaks.
          await this.discardConnection(connection);
          throw error;
        }
        return connection;
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
      throw new Error(`Server greeting failed: ${greeting.message}`);
    }

    signal?.throwIfAborted();

    // Send EHLO
    await connection.ehlo(signal);

    signal?.throwIfAborted();

    // Perform STARTTLS if needed
    // STARTTLS should be used when:
    // 1. Connection is not already secure (secure = false)
    // 2. Server advertises STARTTLS capability
    if (
      !this.config.secure &&
      connection.capabilities.some((cap) =>
        cap.toUpperCase().startsWith("STARTTLS")
      )
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
    if (!this.config.pool) {
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

    // The connection keeps its slot while it sits idle, so no separate check
    // against `poolSize` is needed here: at most `poolSize` connections can be
    // checked out at once, hence at most `poolSize` can ever be returned.
    this.connectionPool.push(connection);
    this.wakeCapacityWaiter();
  }

  /**
   * Closes a checked-out connection and frees the slot it held.
   */
  private async discardConnection(connection: SmtpConnection): Promise<void> {
    try {
      await connection.quit();
    } catch {
      // Ignore errors during cleanup
    }
    this.releaseConnectionSlot();
  }

  /**
   * Closes all active SMTP connections in the connection pool.
   *
   * This method should be called when shutting down the application
   * to ensure all connections are properly closed and resources are freed.
   *
   * @example
   * ```typescript
   * // At application shutdown
   * await transport.closeAllConnections();
   * ```
   */
  async closeAllConnections(): Promise<void> {
    const connections = [...this.connectionPool];
    this.connectionPool = [];

    // Each slot stays reserved until its socket is actually gone, so a caller
    // waiting for capacity cannot open a replacement alongside a connection
    // that is still shutting down.
    await Promise.all(
      connections.map((connection) => this.discardConnection(connection)),
    );
  }

  /**
   * Implements AsyncDisposable interface for automatic resource cleanup.
   *
   * This method is called automatically when using the `using` keyword,
   * ensuring that all SMTP connections are properly closed when the
   * transport goes out of scope.
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
  if (error instanceof SmtpResponseError) {
    const classification = classifySmtpReply(error.code);
    return createFailedReceipt(message, {
      provider: "smtp",
      code: `smtp.${error.code}`,
      category: classification.category,
      retryable: classification.retryable,
      attempts: 1,
      providerDetails: {
        command: error.command,
        response: error.response,
        rejectedRecipients: error.rejectedRecipients,
      },
    });
  }

  return createFailedReceipt(message, {
    provider: "smtp",
    attempts: 1,
  });
}

function classifySmtpReply(code: number): {
  readonly category: "rejected" | "service-unavailable" | "unknown";
  readonly retryable: boolean;
} {
  if (code >= 400 && code < 500) {
    return { category: "service-unavailable", retryable: true };
  }
  if (code >= 500 && code < 600) {
    return { category: "rejected", retryable: false };
  }
  return { category: "unknown", retryable: false };
}

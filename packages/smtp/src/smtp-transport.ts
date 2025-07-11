import type { Message, Receipt, Transport, TransportOptions } from "@upyo/core";
import type { SmtpConfig } from "./config.ts";
import { SmtpConnection } from "./smtp-connection.ts";
import { convertMessage } from "./message-converter.ts";

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
export class SmtpTransport implements Transport, AsyncDisposable {
  config: SmtpConfig;
  connectionPool: SmtpConnection[] = [];
  poolSize: number;

  /**
   * Creates a new SMTP transport instance.
   *
   * @param config SMTP configuration including server details, authentication,
   *               and options.
   */
  constructor(config: SmtpConfig) {
    this.config = config;
    this.poolSize = config.poolSize ?? 5;
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
   */
  async send(message: Message, options?: TransportOptions): Promise<Receipt> {
    options?.signal?.throwIfAborted();

    const connection = await this.getConnection(options?.signal);

    try {
      options?.signal?.throwIfAborted();

      const smtpMessage = await convertMessage(message);

      options?.signal?.throwIfAborted();

      const messageId = await connection.sendMessage(
        smtpMessage,
        options?.signal,
      );

      await this.returnConnection(connection);

      return {
        messageId,
        errorMessages: [],
        successful: true,
      };
    } catch (error) {
      await this.discardConnection(connection);

      return {
        messageId: "",
        errorMessages: [error instanceof Error ? error.message : String(error)],
        successful: false,
      };
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
   */
  async *sendMany(
    messages: Iterable<Message> | AsyncIterable<Message>,
    options?: TransportOptions,
  ): AsyncIterable<Receipt> {
    options?.signal?.throwIfAborted();

    const connection = await this.getConnection(options?.signal);
    let connectionValid = true;

    try {
      const isAsyncIterable = Symbol.asyncIterator in messages;

      if (isAsyncIterable) {
        for await (const message of messages as AsyncIterable<Message>) {
          options?.signal?.throwIfAborted();

          if (!connectionValid) {
            yield {
              messageId: "",
              errorMessages: ["Connection is no longer valid"],
              successful: false,
            };
            continue;
          }

          try {
            const smtpMessage = await convertMessage(message);
            options?.signal?.throwIfAborted();

            const messageId = await connection.sendMessage(
              smtpMessage,
              options?.signal,
            );

            yield {
              messageId,
              errorMessages: [],
              successful: true,
            };
          } catch (error) {
            // Mark connection as invalid on any error
            connectionValid = false;

            yield {
              messageId: "",
              errorMessages: [
                error instanceof Error ? error.message : String(error),
              ],
              successful: false,
            };
          }
        }
      } else {
        for (const message of messages as Iterable<Message>) {
          options?.signal?.throwIfAborted();

          if (!connectionValid) {
            yield {
              messageId: "",
              errorMessages: ["Connection is no longer valid"],
              successful: false,
            };
            continue;
          }

          try {
            const smtpMessage = await convertMessage(message);
            options?.signal?.throwIfAborted();

            const messageId = await connection.sendMessage(
              smtpMessage,
              options?.signal,
            );

            yield {
              messageId,
              errorMessages: [],
              successful: true,
            };
          } catch (error) {
            // Mark connection as invalid on any error
            connectionValid = false;

            yield {
              messageId: "",
              errorMessages: [
                error instanceof Error ? error.message : String(error),
              ],
              successful: false,
            };
          }
        }
      }

      // If connection is still valid, return it to pool
      if (connectionValid) {
        await this.returnConnection(connection);
      } else {
        await this.discardConnection(connection);
      }
    } catch (error) {
      // Error getting connection or during iteration setup
      await this.discardConnection(connection);
      throw error;
    }
  }

  async getConnection(signal?: AbortSignal): Promise<SmtpConnection> {
    signal?.throwIfAborted();

    // Try to get a connection from the pool
    if (this.connectionPool.length > 0) {
      return this.connectionPool.pop()!;
    }

    // Create a new connection
    const connection = new SmtpConnection(this.config);
    await this.connectAndSetup(connection, signal);
    return connection;
  }

  async connectAndSetup(
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

    // Authenticate if needed
    await connection.authenticate(signal);
  }

  async returnConnection(connection: SmtpConnection): Promise<void> {
    if (!this.config.pool) {
      await connection.quit();
      return;
    }

    if (this.connectionPool.length < this.poolSize) {
      try {
        await connection.reset();
        this.connectionPool.push(connection);
      } catch {
        // If reset fails, discard the connection
        await this.discardConnection(connection);
      }
    } else {
      await connection.quit();
    }
  }

  async discardConnection(connection: SmtpConnection): Promise<void> {
    try {
      await connection.quit();
    } catch {
      // Ignore errors during cleanup
    }
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

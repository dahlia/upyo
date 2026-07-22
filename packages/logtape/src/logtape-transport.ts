import { getLogger, type Logger, type LogLevel } from "@logtape/logtape";
import type { Message, Receipt, Transport, TransportOptions } from "@upyo/core";
import {
  type LogTapeTransportOptions,
  type ResolvedLogTapeTransportOptions,
  resolveLogTapeTransportOptions,
} from "./config.ts";
import { PendingQueue } from "./pending-queue.ts";

type SendOperation = "send" | "sendMany";

interface PendingMessage {
  readonly message: Message;
  readonly startedAt: number;
}

type LogTapeTransportConstructorArguments<TProviderId extends string> =
  [TProviderId] extends ["logtape"] ? [
      options?: LogTapeTransportOptions<TProviderId>,
    ]
    : [
      options: LogTapeTransportOptions<TProviderId> & {
        readonly transport: Transport<TProviderId>;
      },
    ];

/**
 * Transport that records email delivery lifecycle events through LogTape.
 *
 * With no wrapped transport, this class acts as a log-only transport and
 * returns synthetic successful receipts.  When a transport is supplied, it
 * decorates that transport without changing its receipts or thrown errors.
 *
 * @typeParam TProviderId The provider id of the wrapped transport, or
 *                        `"logtape"` in log-only mode.
 * @since 0.6.0
 */
export class LogTapeTransport<TProviderId extends string = "logtape">
  implements Transport<TProviderId>, AsyncDisposable {
  /** Provider id used by receipts from this transport. */
  readonly id: TProviderId;

  /** Fully resolved transport options. */
  readonly config: ResolvedLogTapeTransportOptions<TProviderId>;

  private readonly logger: Logger;
  private readonly wrappedTransport?: Transport<TProviderId>;

  /**
   * Creates a LogTape transport.
   *
   * @param options Logging and optional wrapped transport configuration.
   */
  constructor(
    ...[options]: LogTapeTransportConstructorArguments<TProviderId>
  ) {
    this.config = resolveLogTapeTransportOptions(options ?? {});
    this.wrappedTransport = this.config.transport;
    this.id = (this.wrappedTransport?.id ?? "logtape") as TProviderId;
    this.logger = getLogger(this.config.category);
  }

  /**
   * Sends one email while recording its delivery lifecycle.
   *
   * @param message The email message to send.
   * @param options Optional transport options, including cancellation.
   * @returns The wrapped transport receipt, or a synthetic successful receipt
   *          in log-only mode.
   * @throws {DOMException} If the operation is aborted.
   * @throws {Error} If the wrapped transport throws an error.
   */
  send(
    message: Message,
    options?: TransportOptions,
  ): Promise<Receipt<TProviderId>> {
    return this.sendOne(message, options, "send");
  }

  /**
   * Sends multiple emails while recording each delivery lifecycle.
   *
   * A wrapped transport's `sendMany()` implementation is used directly so
   * provider-specific batching and streaming behavior are preserved.
   * Completion logs are emitted as receipts are consumed.  Stopping iteration
   * early closes the wrapped iterator without draining it, preserving its
   * cancellation behavior.
   *
   * @param messages Email messages to send.
   * @param options Optional transport options, including cancellation.
   * @returns An async iterable of unmodified delivery receipts.
   * @throws {DOMException} If the operation is aborted.
   * @throws {Error} If the wrapped transport throws an error.
   */
  async *sendMany(
    messages: Iterable<Message> | AsyncIterable<Message>,
    options?: TransportOptions,
  ): AsyncIterable<Receipt<TProviderId>> {
    options?.signal?.throwIfAborted();

    if (this.wrappedTransport == null) {
      for await (const message of messages) {
        yield await this.sendOne(message, options, "sendMany");
      }
      return;
    }

    const pending = new PendingQueue<PendingMessage>();
    const batchStartedAt = performance.now();
    let consumedCount = 0;
    let completedCount = 0;
    const observedMessages = this.observeMessages(
      messages,
      pending,
      options,
      () => consumedCount++,
    );

    try {
      for await (
        const receipt of this.wrappedTransport.sendMany(
          observedMessages,
          options,
        )
      ) {
        const current = pending.dequeue();
        completedCount++;
        this.logReceipt(receipt, current, "sendMany");
        yield receipt;
      }
    } catch (error) {
      this.logBatchThrownError(
        error,
        pending,
        batchStartedAt,
        consumedCount,
        completedCount,
      );
      throw error;
    }
  }

  /**
   * Disposes the wrapped transport when it supports explicit resource
   * management.
   */
  async [Symbol.asyncDispose](): Promise<void> {
    const transport = this.wrappedTransport;
    if (transport == null) return;

    if (isAsyncDisposable(transport)) {
      await transport[Symbol.asyncDispose]();
      return;
    }

    if (isDisposable(transport)) {
      transport[Symbol.dispose]();
    }
  }

  private async sendOne(
    message: Message,
    options: TransportOptions | undefined,
    operation: SendOperation,
  ): Promise<Receipt<TProviderId>> {
    options?.signal?.throwIfAborted();
    const startedAt = performance.now();
    this.logSending(message, operation);

    try {
      const receipt = this.wrappedTransport == null
        ? this.createSyntheticReceipt()
        : await this.wrappedTransport.send(message, options);
      this.logReceipt(receipt, { message, startedAt }, operation);
      return receipt;
    } catch (error) {
      this.logThrownError(error, message, operation, startedAt);
      throw error;
    }
  }

  private async *observeMessages(
    messages: Iterable<Message> | AsyncIterable<Message>,
    pending: PendingQueue<PendingMessage>,
    options: TransportOptions | undefined,
    onConsume: () => void,
  ): AsyncIterable<Message> {
    for await (const message of messages) {
      options?.signal?.throwIfAborted();
      const startedAt = performance.now();
      this.logSending(message, "sendMany");
      pending.enqueue({ message, startedAt });
      onConsume();
      yield message;
    }
  }

  private createSyntheticReceipt(): Receipt<TProviderId> {
    return {
      successful: true,
      messageId: `logtape-${crypto.randomUUID()}`,
      provider: this.id,
      attempts: 1,
      timestamp: new Date().toISOString(),
    };
  }

  private logSending(message: Message, operation: SendOperation): void {
    this.log(
      this.config.levels.sending,
      this.getMessageTemplate(
        "Sending email.",
        message,
      ),
      {
        ...this.getMessageProperties(message),
        event: "email.sending",
        operation,
        transportId: this.id,
      },
    );
  }

  private logReceipt(
    receipt: Receipt<TProviderId>,
    pendingMessage: PendingMessage | undefined,
    operation: SendOperation,
  ): void {
    const durationMilliseconds = pendingMessage == null
      ? undefined
      : performance.now() - pendingMessage.startedAt;
    const messageProperties = pendingMessage == null
      ? {}
      : this.getMessageProperties(pendingMessage.message);

    if (receipt.successful) {
      this.log(
        this.config.levels.sent,
        this.getMessageTemplate(
          "Email sent.",
          pendingMessage?.message,
        ),
        {
          ...messageProperties,
          event: "email.sent",
          operation,
          transportId: this.id,
          durationMilliseconds,
          messageId: receipt.messageId,
          provider: receipt.provider ?? this.id,
          receipt,
        },
      );
      return;
    }

    this.log(
      this.config.levels.failed,
      this.getMessageTemplate(
        "Failed to send email.",
        pendingMessage?.message,
      ),
      {
        ...messageProperties,
        event: "email.failed",
        operation,
        transportId: this.id,
        durationMilliseconds,
        errorMessages: receipt.errorMessages,
        errors: receipt.errors,
        retryable: receipt.retryable,
        provider: receipt.provider ?? this.id,
        attempts: receipt.attempts,
        receipt,
      },
    );
  }

  private logThrownError(
    error: unknown,
    message: Message | undefined,
    operation: SendOperation,
    startedAt: number,
    extraProperties: Readonly<Record<string, unknown>> = {},
  ): void {
    this.log(
      this.config.levels.failed,
      this.getMessageTemplate("Failed to send email: {error}", message),
      {
        ...(message == null ? {} : this.getMessageProperties(message)),
        ...extraProperties,
        event: "email.failed",
        operation,
        transportId: this.id,
        durationMilliseconds: performance.now() - startedAt,
        error,
      },
    );
  }

  private logBatchThrownError(
    error: unknown,
    pending: PendingQueue<PendingMessage>,
    batchStartedAt: number,
    consumedCount: number,
    completedCount: number,
  ): void {
    const batchProperties = {
      consumedCount,
      completedCount,
      pendingCount: pending.size,
    };
    if (pending.size < 1) {
      this.logThrownError(
        error,
        undefined,
        "sendMany",
        batchStartedAt,
        batchProperties,
      );
      return;
    }

    for (const pendingMessage of pending) {
      this.logThrownError(
        error,
        pendingMessage.message,
        "sendMany",
        pendingMessage.startedAt,
        batchProperties,
      );
    }
  }

  private getMessageProperties(message: Message): Record<string, unknown> {
    return {
      recipientCount: message.recipients.length,
      ccRecipientCount: message.ccRecipients.length,
      bccRecipientCount: message.bccRecipients.length,
      attachmentCount: message.attachments.length,
      priority: message.priority,
      ...(this.config.recordMessage === false ? {} : { message }),
    };
  }

  private getMessageTemplate(
    lifecycleMessage: string,
    message: Message | undefined,
  ): string {
    if (this.config.recordMessage !== "inline" || message == null) {
      return lifecycleMessage;
    }

    const contentPlaceholder = "text" in message.content &&
        message.content.text !== undefined
      ? "{message.content.text}"
      : "{message.content.html}";
    return `${lifecycleMessage}\n\nSubject: {message.subject}\n\n${contentPlaceholder}`;
  }

  private log(
    level: LogLevel,
    message: string,
    properties: Readonly<Record<string, unknown>>,
  ): void {
    this.logger[level](message, properties);
  }
}

function isAsyncDisposable(value: object): value is object & AsyncDisposable {
  return typeof Symbol.asyncDispose !== "undefined" &&
    Symbol.asyncDispose in value &&
    typeof value[Symbol.asyncDispose] === "function";
}

function isDisposable(value: object): value is object & Disposable {
  return typeof Symbol.dispose !== "undefined" &&
    Symbol.dispose in value &&
    typeof value[Symbol.dispose] === "function";
}

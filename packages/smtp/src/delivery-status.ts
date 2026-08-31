import type { TransportOptions } from "@upyo/core";
import type {
  ResolvedSmtpEnvelope,
  SmtpEnvelopeOptions,
  SmtpEnvelopeResolver,
} from "./envelope.ts";

/**
 * A condition under which an SMTP server should issue a delivery status
 * notification for a recipient.
 *
 * `"never"` must be the only condition when it is used.
 *
 * @since 0.6.0
 */
export type SmtpDsnNotification =
  | "never"
  | "success"
  | "failure"
  | "delay";

/**
 * Delivery status notification settings for one SMTP envelope recipient.
 *
 * @since 0.6.0
 */
export interface SmtpDsnRecipientOptions {
  /**
   * Conditions under which the server should issue a notification.
   *
   * `"never"` must appear by itself.  When omitted, the server applies its
   * default behavior, which is normally equivalent to `"failure"` or to
   * `"failure"` together with `"delay"`.
   */
  readonly notify?: readonly SmtpDsnNotification[];

  /**
   * The original Internet mail address to identify in notifications.
   *
   * Upyo serializes this as an RFC 3461 `ORCPT` parameter with the `rfc822`
   * address type.  For an initial submission, RFC 3461 requires this value to
   * equal the corresponding envelope recipient address.
   */
  readonly originalRecipient?: string;
}

/**
 * SMTP delivery status notification settings for one message.
 *
 * These settings are serialized as SMTP envelope parameters and are not added
 * to the message headers.
 *
 * @since 0.6.0
 */
export interface SmtpDsnOptions {
  /**
   * An identifier that will be returned in delivery status notifications.
   * Serialized as the RFC 3461 `ENVID` parameter.  The identifier must not be
   * empty.
   */
  readonly envelopeId?: string;

  /**
   * How much of the original message a failure notification should return.
   * Serialized as `RET=FULL` or `RET=HDRS`.
   */
  readonly return?: "full" | "headers";

  /**
   * Per-recipient notification settings, keyed by exact envelope address.
   */
  readonly recipients?: Readonly<Record<string, SmtpDsnRecipientOptions>>;
}

/**
 * SMTP-specific options for sending messages.
 *
 * @since 0.6.0
 */
export interface SmtpTransportOptions extends TransportOptions {
  /**
   * SMTP envelope overrides for this send operation.
   *
   * A resolver can return a different envelope for each message passed to
   * {@link SmtpTransport.sendMany}.
   */
  readonly envelope?: SmtpEnvelopeOptions | SmtpEnvelopeResolver;

  /** Delivery status notification settings for this SMTP transaction. */
  readonly dsn?: SmtpDsnOptions;
}

/**
 * Error produced when SMTP delivery status notification settings are invalid.
 *
 * @since 0.6.0
 */
export class SmtpDsnValidationError extends TypeError {
  /**
   * Creates a delivery status notification validation error.
   *
   * @param message A description of the invalid setting.
   */
  constructor(message: string) {
    super(message);
    this.name = "SmtpDsnValidationError";
  }
}

/**
 * Error produced when delivery status notifications were requested from an
 * SMTP server that did not advertise the RFC 3461 `DSN` extension.
 *
 * @since 0.6.0
 */
export class SmtpDsnUnsupportedError extends Error {
  /** Creates an error for a server without the `DSN` extension. */
  constructor() {
    super(
      "Delivery status notifications were requested, but the server does " +
        "not advertise the DSN extension.",
    );
    this.name = "SmtpDsnUnsupportedError";
  }
}

/** @internal */
export interface ResolvedSmtpDsn {
  readonly mailParameters: readonly string[];
  readonly recipientParameters: readonly (readonly string[])[];
}

const NOTIFICATION_CONDITIONS: ReadonlySet<string> = new Set([
  "never",
  "success",
  "failure",
  "delay",
]);

/**
 * Validates and serializes the RFC 3461 envelope parameters for a message.
 *
 * @param envelope The effective SMTP envelope that will carry the parameters.
 * @param dsn The caller-supplied delivery status notification settings.
 * @returns Serialized parameters, or `undefined` when none were requested.
 * @throws {SmtpDsnValidationError} If any setting violates RFC 3461 or does
 * not correspond to the message envelope.
 * @internal
 */
export function resolveSmtpDsn(
  envelope: ResolvedSmtpEnvelope,
  dsn: SmtpDsnOptions | undefined,
): ResolvedSmtpDsn | undefined {
  if (dsn == null) return undefined;
  if (typeof dsn !== "object" || Array.isArray(dsn)) {
    throw new SmtpDsnValidationError("DSN options must be an object.");
  }

  const mailParameters: string[] = [];
  if (dsn.return != null) {
    if (dsn.return !== "full" && dsn.return !== "headers") {
      throw new SmtpDsnValidationError(
        `Unsupported DSN return value: ${String(dsn.return)}`,
      );
    }
    mailParameters.push(`RET=${dsn.return === "full" ? "FULL" : "HDRS"}`);
  }

  if (dsn.envelopeId != null) {
    if (dsn.envelopeId === "") {
      throw new SmtpDsnValidationError(
        "DSN envelope ID must not be empty.",
      );
    }
    const encoded = encodeXtext(dsn.envelopeId, "DSN envelope ID");
    const parameter = `ENVID=${encoded}`;
    assertParameterLength(parameter, 100, "ENVID");
    mailParameters.push(parameter);
  }

  const envelopeRecipients = envelope.to;
  const envelopeRecipientSet: ReadonlySet<string> = new Set(
    envelopeRecipients,
  );
  const configuredRecipients = dsn.recipients;
  if (
    configuredRecipients != null &&
    (typeof configuredRecipients !== "object" ||
      Array.isArray(configuredRecipients))
  ) {
    throw new SmtpDsnValidationError(
      "DSN recipient options must be an object.",
    );
  }

  const serializedByAddress = new Map<string, readonly string[]>();
  for (const [address, options] of Object.entries(configuredRecipients ?? {})) {
    if (!envelopeRecipientSet.has(address)) {
      throw new SmtpDsnValidationError(
        `DSN recipient ${address} is not an envelope recipient.`,
      );
    }
    if (
      options == null || typeof options !== "object" || Array.isArray(options)
    ) {
      throw new SmtpDsnValidationError(
        `DSN options for ${address} must be an object.`,
      );
    }

    const parameters: string[] = [];
    if (options.notify != null) {
      const notify = options.notify;
      if (!Array.isArray(notify) || notify.length === 0) {
        throw new SmtpDsnValidationError(
          `DSN notification conditions for ${address} must be a non-empty array.`,
        );
      }
      for (const condition of notify) {
        if (
          typeof condition !== "string" ||
          !NOTIFICATION_CONDITIONS.has(condition)
        ) {
          throw new SmtpDsnValidationError(
            `Unsupported DSN notification condition: ${String(condition)}`,
          );
        }
      }
      if (notify.includes("never") && notify.length !== 1) {
        throw new SmtpDsnValidationError(
          "The DSN notification condition NEVER must appear by itself.",
        );
      }
      parameters.push(
        `NOTIFY=${
          notify.map((condition) => condition.toUpperCase()).join(",")
        }`,
      );
    }

    if (options.originalRecipient != null) {
      const encoded = encodeXtext(
        options.originalRecipient,
        `DSN original recipient for ${address}`,
      );
      if (options.originalRecipient !== address) {
        throw new SmtpDsnValidationError(
          `DSN original recipient for ${address} must match the envelope ` +
            "recipient address.",
        );
      }
      const parameter = `ORCPT=rfc822;${encoded}`;
      assertParameterLength(parameter, 500, "ORCPT");
      parameters.push(parameter);
    }
    serializedByAddress.set(address, parameters);
  }

  const recipientParameters = envelopeRecipients.map((address) =>
    serializedByAddress.get(address) ?? []
  );
  const requested = mailParameters.length > 0 ||
    recipientParameters.some((parameters) => parameters.length > 0);
  return requested ? { mailParameters, recipientParameters } : undefined;
}

function encodeXtext(value: string, name: string): string {
  if (typeof value !== "string") {
    throw new SmtpDsnValidationError(`${name} must be a string.`);
  }

  let encoded = "";
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code > 0x7e) {
      throw new SmtpDsnValidationError(
        `${name} must contain only printable US-ASCII characters.`,
      );
    }
    if (code >= 0x21 && code <= 0x7e && code !== 0x2b && code !== 0x3d) {
      encoded += value[index];
    } else {
      encoded += `+${code.toString(16).toUpperCase().padStart(2, "0")}`;
    }
  }
  return encoded;
}

function assertParameterLength(
  parameter: string,
  maximum: number,
  name: string,
): void {
  if (parameter.length > maximum) {
    throw new SmtpDsnValidationError(
      `${name} parameter exceeds the RFC 3461 limit of ${maximum} characters.`,
    );
  }
}

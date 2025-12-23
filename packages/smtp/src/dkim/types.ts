/**
 * Supported DKIM signing algorithms.
 *
 * - `rsa-sha256`: RSA with SHA-256, most widely used (RFC 6376)
 * - `ed25519-sha256`: Ed25519 with SHA-256, shorter keys (RFC 8463)
 *
 * @since 0.4.0
 */
export type DkimAlgorithm = "rsa-sha256" | "ed25519-sha256";

/**
 * DKIM canonicalization methods for header and body.
 *
 * Format: "header-method/body-method"
 *
 * - `simple`: No modifications (preserves exact content)
 * - `relaxed`: Normalizes whitespace and case
 *
 * @see RFC 6376 Section 3.4
 * @since 0.4.0
 */
export type DkimCanonicalization =
  | "relaxed/relaxed"
  | "relaxed/simple"
  | "simple/relaxed"
  | "simple/simple";

/**
 * Configuration for a single DKIM signature.
 *
 * Each signature represents one DKIM-Signature header that will be added
 * to the email. Multiple signatures can be used for different domains
 * or selectors.
 *
 * @since 0.4.0
 */
export interface DkimSignature {
  /**
   * The domain name for the DKIM key (d= tag).
   * This is the domain claiming responsibility for the message.
   */
  readonly signingDomain: string;

  /**
   * The DKIM selector (s= tag).
   * Used to locate the public key in DNS: `selector._domainkey.signingDomain`
   */
  readonly selector: string;

  /**
   * The private key for signing.
   *
   * Can be either:
   * - A PEM-encoded private key string (PKCS#8 format)
   * - A `CryptoKey` object from Web Crypto API
   *
   * For RSA keys, use PKCS#8 PEM format or import via `crypto.subtle.importKey`.
   * For Ed25519 keys, use PKCS#8 PEM format or import via `crypto.subtle.importKey`.
   */
  readonly privateKey: string | CryptoKey;

  /**
   * The signing algorithm (a= tag).
   * @default "rsa-sha256"
   */
  readonly algorithm?: DkimAlgorithm;

  /**
   * The canonicalization method for header and body (c= tag).
   * @default "relaxed/relaxed"
   */
  readonly canonicalization?: DkimCanonicalization;

  /**
   * Header fields to include in the signature (h= tag).
   * @default ["from", "to", "subject", "date"]
   */
  readonly headerFields?: readonly string[];
}

/**
 * Action to take when DKIM signing fails.
 *
 * - `throw`: Throw an error and abort sending (default)
 * - `send-unsigned`: Log a warning and send the email without DKIM signature
 *
 * @since 0.4.0
 */
export type DkimSigningFailureAction = "throw" | "send-unsigned";

/**
 * Configuration for DKIM signing in SMTP transport.
 *
 * @since 0.4.0
 */
export interface DkimConfig {
  /**
   * Array of DKIM signature configurations.
   * Each configuration will result in one DKIM-Signature header.
   */
  readonly signatures: readonly DkimSignature[];

  /**
   * Action to take when DKIM signing fails.
   * @default "throw"
   */
  readonly onSigningFailure?: DkimSigningFailureAction;
}

/**
 * Result of DKIM signing operation.
 *
 * @since 0.4.0
 */
export interface DkimSignResult {
  /**
   * The complete DKIM-Signature header value (without header name).
   */
  readonly signature: string;

  /**
   * The header name, always "DKIM-Signature".
   */
  readonly headerName: "DKIM-Signature";
}

/**
 * Default header fields to sign if not specified.
 *
 * @since 0.4.0
 */
export const DEFAULT_SIGNED_HEADERS: readonly string[] = [
  "from",
  "to",
  "subject",
  "date",
];

/**
 * Default DKIM algorithm.
 *
 * @since 0.4.0
 */
export const DEFAULT_ALGORITHM: DkimAlgorithm = "rsa-sha256";

/**
 * Default canonicalization method.
 *
 * @since 0.4.0
 */
export const DEFAULT_CANONICALIZATION: DkimCanonicalization = "relaxed/relaxed";

/**
 * DKIM (DomainKeys Identified Mail) signing module.
 *
 * Provides DKIM signing functionality for the SMTP transport
 * following RFC 6376.
 *
 * @see https://www.rfc-editor.org/rfc/rfc6376
 * @since 0.4.0
 */

export {
  canonicalizeBodyRelaxed,
  canonicalizeBodySimple,
  canonicalizeHeaderRelaxed,
  canonicalizeHeaderSimple,
} from "./canonicalize.ts";
export { signMessage } from "./sign.ts";
export {
  DEFAULT_ALGORITHM,
  DEFAULT_CANONICALIZATION,
  DEFAULT_SIGNED_HEADERS,
  type DkimAlgorithm,
  type DkimCanonicalization,
  type DkimConfig,
  type DkimSignature,
  type DkimSigningFailureAction,
  type DkimSignResult,
} from "./types.ts";

/**
 * DKIM (DomainKeys Identified Mail) signing module.
 *
 * Provides DKIM signing functionality for composed messages
 * following RFC 6376.
 *
 * @see https://www.rfc-editor.org/rfc/rfc6376
 * @since 0.6.0
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
  type DkimBodyMode,
  type DkimCanonicalization,
  type DkimConfig,
  type DkimSignature,
  type DkimSigningFailureAction,
  type DkimSignResult,
} from "./types.ts";

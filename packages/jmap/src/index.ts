/**
 * @upyo/jmap - JMAP transport for Upyo email library
 * RFC 8620 (core) and RFC 8621 (mail) compliant
 * @module
 * @since 0.4.0
 */

export { JmapTransport } from "./jmap-transport.ts";
export {
  createJmapConfig,
  type JmapConfig,
  type ResolvedJmapConfig,
} from "./config.ts";
export { isCapabilityError, JMAP_ERROR_TYPES, JmapApiError } from "./errors.ts";
export type { JmapAccount, JmapIdentity, JmapSession } from "./session.ts";
export { type BlobUploadResponse, uploadBlob } from "./blob-uploader.ts";

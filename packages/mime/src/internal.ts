/**
 * Shared implementation for Upyo transports. This surface remains additively
 * compatible within a minor release line; applications should use the root API.
 * @module
 * @internal
 */
export { type PreparedMimeMessage, prepareMimeMessage } from "./message.ts";
export {
  MimeAttachmentReplayError,
  type MimeStream,
  prepareMimeStream,
  type PrepareMimeStreamOptions,
} from "./stream.ts";
export type { DkimConfig } from "./dkim/types.ts";
export { validateDkimBodyMode } from "./dkim/types.ts";
export { signMessage } from "./dkim/sign.ts";

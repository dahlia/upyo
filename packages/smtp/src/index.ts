export { SmtpTransport } from "./smtp-transport.ts";
export type {
  OAuth2TokenProvider,
  SmtpAuth,
  SmtpConfig,
  SmtpOAuth2Auth,
  SmtpOAuth2RefreshAuth,
  SmtpOAuth2TokenAuth,
  SmtpTlsOptions,
  SmtpUserPassAuth,
} from "./config.ts";
export { SmtpAuthError } from "./oauth2.ts";
export { SmtpEnvelopeValidationError } from "./envelope.ts";
export type { SmtpEnvelopeOptions, SmtpEnvelopeResolver } from "./envelope.ts";
export {
  SmtpDsnUnsupportedError,
  SmtpDsnValidationError,
} from "./delivery-status.ts";
export { isSmtpResponseProviderDetails } from "./smtp-receipt.ts";
export type {
  SmtpDsnNotification,
  SmtpDsnOptions,
  SmtpDsnRecipientOptions,
  SmtpTransportOptions,
} from "./delivery-status.ts";
export type {
  SmtpEnhancedStatusCode,
  SmtpMessageSizeProviderDetails,
  SmtpProviderDetails,
  SmtpReceipt,
  SmtpRejectedRecipient,
  SmtpResponseProviderDetails,
  SmtpUtf8ProviderDetails,
} from "./smtp-receipt.ts";
export type {
  DkimAlgorithm,
  DkimCanonicalization,
  DkimConfig,
  DkimSignature,
  DkimSigningFailureAction,
} from "./dkim/index.ts";

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
export type {
  DkimAlgorithm,
  DkimCanonicalization,
  DkimConfig,
  DkimSignature,
  DkimSigningFailureAction,
} from "./dkim/index.ts";

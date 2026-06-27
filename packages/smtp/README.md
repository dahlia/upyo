<!-- deno-fmt-ignore-file -->

@upyo/smtp
==========

[![JSR][JSR badge]][JSR]
[![npm][npm badge]][npm]

SMTP transport implementation for the [Upyo] email library.

[JSR badge]: https://jsr.io/badges/@upyo/smtp
[JSR]: https://jsr.io/@upyo/smtp
[npm badge]: https://img.shields.io/npm/v/@upyo/smtp?logo=npm
[npm]: https://www.npmjs.com/package/@upyo/smtp
[Upyo]: https://upyo.org/


Features
--------

 -  Full SMTP protocol implementation
 -  TLS/SSL support
 -  Connection pooling
 -  Multiple authentication methods
 -  OAuth 2.0 authentication (SASL XOAUTH2 and OAUTHBEARER)
 -  HTML and plain text email support
 -  File attachments (regular and inline)
 -  Multiple recipients (To, CC, BCC)
 -  Custom headers
 -  Priority levels
 -  Comprehensive testing utilities
 -  TypeScript support
 -  Cross-runtime compatibility (Node.js, Bun, Deno)
 -  STARTTLS support for secure connection upgrade
 -  DKIM signing support (RSA-SHA256 and Ed25519-SHA256)


Installation
------------

~~~~ sh
npm  add       @upyo/core @upyo/smtp
pnpm add       @upyo/core @upyo/smtp
yarn add       @upyo/core @upyo/smtp
deno add --jsr @upyo/core @upyo/smtp
bun  add       @upyo/core @upyo/smtp
~~~~


Usage
-----

### Basic Email Sending

~~~~ typescript
import { createMessage } from "@upyo/core";
import { SmtpTransport } from "@upyo/smtp";

const transport = new SmtpTransport({
  host: "smtp.example.com",
  port: 587,
  secure: false,
  auth: {
    user: "username",
    pass: "password",
  },
});

const message = createMessage({
  from: "sender@example.com",
  to: "recipient@example.net",
  subject: "Hello from Upyo!",
  content: { text: "This is a test email." },
});

const receipt = await transport.send(message);
if (receipt.successful) {
  console.log("Message sent with ID:", receipt.messageId);
} else {
  console.error("Send failed:", receipt.errorMessages.join(", "));
}
~~~~

### Sending Multiple Emails

~~~~ typescript
const messages = [message1, message2, message3];

for await (const receipt of transport.sendMany(messages)) {
  if (receipt.successful) {
    console.log(`Email sent with ID: ${receipt.messageId}`);
  } else {
    console.error(`Email failed: ${receipt.errorMessages.join(", ")}`);
  }
}
~~~~


Configuration options
---------------------

### `SmtpConfig`

| Option              | Type             | Default       | Description                      |
| ------------------- | ---------------- | ------------- | -------------------------------- |
| `host`              | `string`         |               | SMTP server hostname             |
| `port`              | `number`         | `587`         | SMTP server port                 |
| `secure`            | `boolean`        | `true`        | Use TLS/SSL connection           |
| `auth`              | `SmtpAuth`       |               | Authentication configuration     |
| `tls`               | `SmtpTlsOptions` |               | TLS configuration                |
| `connectionTimeout` | `number`         | `60000`       | Connection timeout (ms)          |
| `socketTimeout`     | `number`         | `60000`       | Socket timeout (ms)              |
| `localName`         | `string`         | `"localhost"` | Local hostname for `HELO`/`EHLO` |
| `pool`              | `boolean`        | `true`        | Enable connection pooling        |
| `poolSize`          | `number`         | `5`           | Maximum pool connections         |
| `dkim`              | `DkimConfig`     |               | DKIM signing configuration       |

### `SmtpAuth`

`SmtpAuth` is a discriminated union of three strategies.

Username/password (`SmtpUserPassAuth`), discriminated by `pass`:

| Option   | Type                               | Default   | Description |
| -------- | ---------------------------------- | --------- | ----------- |
| `user`   | `string`                           |           | Username    |
| `pass`   | `string`                           |           | Password    |
| `method` | `"plain" \| "login" \| "cram-md5"` | `"plain"` | Auth method |

OAuth 2.0 access token (`SmtpOAuth2TokenAuth`), discriminated by `accessToken`:

| Option        | Type                            | Default     | Description                                 |
| ------------- | ------------------------------- | ----------- | ------------------------------------------- |
| `user`        | `string`                        |             | User (email address)                        |
| `accessToken` | `string \| OAuth2TokenProvider` |             | Access token, or a callback returning one   |
| `method`      | `"xoauth2" \| "oauthbearer"`    | `"xoauth2"` | SASL mechanism (auto-detected when omitted) |

OAuth 2.0 refresh-token flow (`SmtpOAuth2RefreshAuth`), discriminated by
`refreshToken`:

| Option          | Type                         | Default     | Description                                 |
| --------------- | ---------------------------- | ----------- | ------------------------------------------- |
| `user`          | `string`                     |             | User (email address)                        |
| `clientId`      | `string`                     |             | OAuth 2.0 client identifier                 |
| `clientSecret`  | `string`                     |             | OAuth 2.0 client secret (optional)          |
| `refreshToken`  | `string`                     |             | OAuth 2.0 refresh token                     |
| `tokenEndpoint` | `string`                     |             | Token endpoint URL                          |
| `scope`         | `string`                     |             | Space-delimited scopes (optional)           |
| `method`        | `"xoauth2" \| "oauthbearer"` | `"xoauth2"` | SASL mechanism (auto-detected when omitted) |

The access token may be a static string or a callback (`OAuth2TokenProvider`)
that returns a fresh token on demand—use the callback to integrate an OAuth
client such as `google-auth-library` or `msal-node`.  With the refresh-token
flow the transport runs the `refresh_token` grant itself, caching the access
token across pooled connections.  See the
[OAuth 2.0 authentication guide][oauth-guide] for details.

[oauth-guide]: https://upyo.org/transports/smtp#oauth-2-0-authentication


DKIM signing
------------

DKIM (DomainKeys Identified Mail) signing is supported for improved email
deliverability and authentication:

~~~~ typescript
import { createMessage } from "@upyo/core";
import { SmtpTransport } from "@upyo/smtp";
import { readFileSync } from "node:fs";

const transport = new SmtpTransport({
  host: "smtp.example.com",
  port: 587,
  secure: false,
  auth: { user: "user@example.com", pass: "password" },
  dkim: {
    signatures: [{
      signingDomain: "example.com",
      selector: "mail",
      privateKey: readFileSync("./dkim-private.pem", "utf8"),
    }],
  },
});
~~~~

### `DkimConfig`

| Option             | Type                         | Default   | Description                     |
| ------------------ | ---------------------------- | --------- | ------------------------------- |
| `signatures`       | `DkimSignature[]`            |           | Array of DKIM signature configs |
| `onSigningFailure` | `"throw" \| "send-unsigned"` | `"throw"` | Action when signing fails       |

### `DkimSignature`

| Option             | Type                               | Default             | Description                             |
| ------------------ | ---------------------------------- | ------------------- | --------------------------------------- |
| `signingDomain`    | `string`                           |                     | Domain for DKIM key (d= tag)            |
| `selector`         | `string`                           |                     | DKIM selector (s= tag)                  |
| `privateKey`       | `string \| CryptoKey`              |                     | Private key (PEM string or `CryptoKey`) |
| `algorithm`        | `"rsa-sha256" \| "ed25519-sha256"` | `"rsa-sha256"`      | Signing algorithm                       |
| `canonicalization` | `string`                           | `"relaxed/relaxed"` | Header/body canonicalization            |
| `headerFields`     | `string[]`                         | From, To, …         | Headers to sign                         |


Testing
-------

### Mock SMTP Server

For unit testing, use the included mock SMTP server:

~~~~ typescript
import { MockSmtpServer, SmtpTransport } from "@upyo/smtp";

const server = new MockSmtpServer();
const port = await server.start();

const transport = new SmtpTransport({
  host: "localhost",
  port,
  secure: false,
  auth: { user: "test", pass: "test" },
});

// Send test email
await transport.send(message);

// Check received messages
const received = server.getReceivedMessages();
console.log(received[0].data); // Raw email content

await server.stop();
~~~~

### OAuth 2.0 end-to-end tests

The OAuth 2.0 end-to-end tests run against a real provider (e.g. Gmail or
Outlook) and are skipped unless the following environment variables are set:

| Variable                | Description                            |
| ----------------------- | -------------------------------------- |
| `SMTP_OAUTH2_HOST`      | SMTP host (e.g. `smtp.gmail.com`)      |
| `SMTP_OAUTH2_PORT`      | SMTP port (default `587`)              |
| `SMTP_OAUTH2_SECURE`    | `true` for implicit TLS                |
| `SMTP_OAUTH2_USER`      | User (email address)                   |
| `SMTP_OAUTH2_MECHANISM` | `xoauth2` or `oauthbearer` (optional)  |
| `SMTP_OAUTH2_FROM`      | Envelope sender (defaults to the user) |
| `SMTP_OAUTH2_TO`        | Recipient (defaults to the user)       |

Provide a token source as either a static access token:

| Variable                   | Description        |
| -------------------------- | ------------------ |
| `SMTP_OAUTH2_ACCESS_TOKEN` | OAuth access token |

or the refresh-token flow:

| Variable                     | Description                       |
| ---------------------------- | --------------------------------- |
| `SMTP_OAUTH2_CLIENT_ID`      | OAuth client identifier           |
| `SMTP_OAUTH2_CLIENT_SECRET`  | OAuth client secret (optional)    |
| `SMTP_OAUTH2_REFRESH_TOKEN`  | OAuth refresh token               |
| `SMTP_OAUTH2_TOKEN_ENDPOINT` | Token endpoint URL                |
| `SMTP_OAUTH2_SCOPE`          | Space-delimited scopes (optional) |

A Gmail access token can be minted with [google-auth-library], and an Outlook
one with [msal-node].

[google-auth-library]: https://github.com/googleapis/google-auth-library-nodejs
[msal-node]: https://github.com/AzureAD/microsoft-authentication-library-for-js/tree/dev/lib/msal-node

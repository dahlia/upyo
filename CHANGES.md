Upyo changelog
==============

Version 0.5.0
-------------

To be released.

### @upyo/core

 -  Added structured delivery error metadata to failed `Receipt` values.
    Failed receipts still include `errorMessages` for existing code, and may
    now also include `errors`, `retryable`, `provider`, `attempts`, and
    `timestamp` fields for programmatic error handling.  [[#25], [#27]]

    `Receipt`, `ReceiptError`, and `Transport` are now generic over the
    transport provider id, and `Transport` implementations expose a stable
    `id` field so `provider` metadata can be type-checked.

     -  Added the `ReceiptError` interface.
     -  Added the `ReceiptErrorCategory` type.
     -  Added the `ReceiptErrorClassification` interface.
     -  Added the `CreateReceiptErrorOptions` interface.
     -  Added the `CreateFailedReceiptOptions` interface.
     -  Added the `classifyHttpStatus()` function.
     -  Added the `classifyReceiptError()` function.
     -  Added the `createReceiptError()` function.
     -  Added the `createFailedReceipt()` function.
     -  Added the `parseRetryAfter()` function.

[#25]: https://github.com/dahlia/upyo/issues/25
[#27]: https://github.com/dahlia/upyo/pull/27

### @upyo/jmap

 -  Updated `JmapTransport` to return structured failure receipts with
    provider ids, retryability, HTTP status codes, retry delay metadata from
    `Retry-After`, and attempt counts where available.  [[#25], [#27]]

### @upyo/lettermint

 -  Added [Lettermint] transport.  [[#22], [#23]]

     -  Added `LettermintTransport` class.
     -  Added `LettermintConfig` interface.
     -  Added `ResolvedLettermintConfig` type.
     -  Added `LettermintSettings` interface.
     -  Added `LettermintApiError` class.
     -  Added `LettermintBatchResponse` type.
     -  Added `LettermintError` interface.
     -  Added `LettermintResponse` interface.
     -  Added `LettermintStatus` type.
     -  Supports single sends, batch sends, idempotency keys, attachments,
        inline images, routes, tags, metadata, and tracking settings.

[Lettermint]: https://lettermint.co/
[#22]: https://github.com/dahlia/upyo/issues/22
[#23]: https://github.com/dahlia/upyo/pull/23

### @upyo/mailgun

 -  Updated `MailgunTransport` to return structured failure receipts with
    provider ids, retryability, HTTP status codes, retry delay metadata from
    `Retry-After`, and attempt counts where available.  [[#25], [#27]]

### @upyo/plunk

 -  Updated `PlunkTransport` to return structured failure receipts with
    provider ids, retryability, HTTP status codes, retry delay metadata from
    `Retry-After`, and attempt counts where available.  [[#25], [#27]]

### @upyo/resend

 -  Updated `ResendTransport` to return structured failure receipts with
    provider ids, retryability, HTTP status codes, retry delay metadata from
    `Retry-After`, and attempt counts where available.  Batch item failures
    now include structured error metadata as well.  [[#25], [#27]]

### @upyo/sendgrid

 -  Updated `SendGridTransport` to return structured failure receipts with
    provider ids, retryability, HTTP status codes, retry delay metadata from
    `Retry-After`, and attempt counts where available.  [[#25], [#27]]

### @upyo/ses

 -  Updated `SesTransport` to return structured failure receipts with provider
    ids, retryability, HTTP status codes, retry delay metadata from
    `Retry-After`, and attempt counts where available.  [[#25], [#27]]

### @upyo/smtp

 -  Updated `SmtpTransport` to return structured failure receipts with
    provider ids, retryability, attempt counts, and classified network,
    timeout, authentication, and rejection errors.  [[#25], [#27]]

 -  Added OAuth 2.0 authentication support to the SMTP transport, using the
    SASL *XOAUTH2* and *OAUTHBEARER* ([RFC 7628]) mechanisms.  This enables
    authentication with providers such as Gmail and Outlook that require OAuth
    2.0 instead of passwords.  [[#19], [#24]]

     -  `SmtpAuth` is now a discriminated union of `SmtpUserPassAuth`
        (username/password, as before) and the OAuth 2.0 variants.  Existing
        `{ user, pass }` configurations continue to work unchanged.
     -  Added `SmtpOAuth2Auth`, `SmtpOAuth2TokenAuth`, and
        `SmtpOAuth2RefreshAuth` interfaces, and the `SmtpUserPassAuth`
        interface.
     -  Added the `OAuth2TokenProvider` type.  The `accessToken` field accepts
        either a static token string or a callback returning a fresh token,
        which can integrate an external OAuth client (e.g.,
        `google-auth-library` or `msal-node`) for transparent refresh.
     -  Added the built-in `refresh_token` grant flow
        (`SmtpOAuth2RefreshAuth`): provide `clientId`, `refreshToken`, and
        `tokenEndpoint`, and the transport exchanges them for an access token,
        caching it across pooled connections until shortly before it expires.
     -  Added the `SmtpAuthError` class, thrown on OAuth token acquisition and
        SASL authentication failures.

 -  Changed `SmtpTransport.send()` and `SmtpTransport.sendMany()` to report
    connection and authentication setup failures as a failed `Receipt` instead
    of throwing.  Previously, a failure to connect or authenticate (e.g., an
    invalid host, a refused connection, or rejected credentials) rejected the
    returned promise, which was inconsistent with message-level failures (such
    as a rejected recipient) that were already reported as a failed `Receipt`.
    Now all delivery failures—including setup failures—are reported uniformly
    as a failed `Receipt`.  Cancellation via `AbortSignal` continues to reject.
    [[#19], [#24]]

[RFC 7628]: https://www.rfc-editor.org/rfc/rfc7628
[#19]: https://github.com/dahlia/upyo/issues/19
[#24]: https://github.com/dahlia/upyo/pull/24

### @upyo/pool

 -  Updated `PoolTransport` to preserve child transport provider ids in
    aggregated structured errors.  The pool itself reports failed aggregate
    receipts with the `"pool"` provider id, while child errors keep the
    underlying transport ids as a type-safe union.  [[#25], [#27]]

### @upyo/opentelemetry

 -  Changed the built-in error category labels from underscore spelling to
    hyphen spelling: `rate-limit`, `service-unavailable`, and `server-error`.
    OpenTelemetry metrics now prefer structured receipt categories when a
    wrapped transport returns them, then fall back to the configured error
    classifier.  [[#25], [#27]]


Version 0.4.0
-------------

Released on December 25, 2025. Happy Holidays!

### @upyo/core

 -  Added `idempotencyKey` property to `Message` interface.  [[#16]]

    This allows users to provide their own idempotency key for request
    deduplication when retrying failed send operations.  By including the key
    in the message itself, retries become simpler—just resend the same message
    object.  If not provided, transports may generate their own key internally
    (behavior varies by transport implementation).

[#16]: https://github.com/dahlia/upyo/issues/16

### @upyo/smtp

 -  Added DKIM (DomainKeys Identified Mail) signing support.  [[#18]]

    Outgoing emails can now be signed with DKIM for improved deliverability
    and authentication.  The implementation uses the standard Web Crypto API
    for cross-runtime compatibility (Node.js, Deno, Bun, edge functions).

     -  Added `DkimConfig` interface for configuring DKIM signing.
     -  Added `DkimSignature` interface for individual signature settings.
     -  Added `DkimAlgorithm` type supporting `rsa-sha256` (RFC 6376) and
        `ed25519-sha256` (RFC 8463).
     -  Added `DkimCanonicalization` type for header/body canonicalization.
     -  Added `DkimSigningFailureAction` type (`throw` or `send-unsigned`).
     -  Supports multiple DKIM signatures per message.
     -  Configurable failure handling: throw error or send unsigned.
     -  Accepts both PEM strings and `CryptoKey` objects for private keys.

[#18]: https://github.com/dahlia/upyo/issues/18

### @upyo/jmap

 -  Added JMAP transport for sending emails via JMAP protocol.  [[#10]]

    JMAP (JSON Meta Application Protocol) is a modern, efficient protocol for
    email access and submission, defined in RFC 8620 (core) and RFC 8621 (mail).
    This transport provides:

     -  Automatic session discovery and caching
     -  Automatic identity resolution from sender email
     -  Bearer token authentication
     -  Exponential backoff retry with configurable attempts
     -  Request timeout and `AbortSignal` support
     -  Text and HTML message content (`multipart/alternative`)
     -  Priority headers (`X-Priority`, `Importance`)
     -  Custom headers
     -  File attachments via blob upload
     -  Inline attachments (`multipart/related`)

[#10]: https://github.com/dahlia/upyo/issues/10

### @upyo/resend

 -  Added support for user-provided idempotency keys via
    `Message.idempotencyKey`. [[#16]]

    Each message can now include an `idempotencyKey` to ensure it is not sent
    multiple times during retries.  For batch operations via `sendMany()`, the
    first message's key is used for the entire batch request.  If not provided,
    a unique key is automatically generated for each request.


Version 0.3.4
-------------

Released on December 18, 2025.

### @upyo/resend

 -  Fixed idempotency key not being sent as an HTTP request header.  [[#16]]

    The Resend transport was incorrectly adding the `Idempotency-Key` to the
    email's custom headers inside the JSON payload, but the Resend API expects
    it as an HTTP request header.  This fix moves the idempotency key to the
    proper location.


Version 0.3.3
-------------

Released on December 13, 2025.

### @upyo/core

 -  Fixed a potential SMTP command injection vulnerability.

    Email addresses are now validated to prevent newline characters (`\r` or
    `\n`), which could be used to inject malicious SMTP commands.


Version 0.3.2
-------------

Released on December 12, 2025.

### @upyo/ses

 -  Fixed headers serialization issue on edge runtimes.  [[#15]]

    The SES transport now converts the `Headers` object to a plain object
    before passing to `fetch()`, which resolves “Missing Authentication
    Token” errors on edge runtimes like Bunny CDN Edge that don't properly
    serialize `Headers` objects.

[#15]: https://github.com/dahlia/upyo/issues/15


Version 0.3.1
-------------

Released on November 3, 2025.

### @upyo/smtp

 -  Added STARTTLS support for secure connection upgrade.  The SMTP transport
    now automatically detects and uses STARTTLS when connecting to servers
    that advertise this capability (such as Protonmail, Office 365, and others).
    This allows using port 587 with `secure: false` for automatic encryption
    upgrade.  [[#14]]

[#14]: https://github.com/dahlia/upyo/issues/14


Version 0.3.0
-------------

Released on September 16, 2025.

### @upyo/pool

 -  Added pool transport for combining multiple email providers with load
    balancing and failover strategies.  [[#8]]

     -  Added `PoolTransport` class with `AsyncDisposable` support.
     -  Added `PoolConfig` interface.
     -  Added `ResolvedPoolConfig` type.
     -  Added `TransportEntry` interface.
     -  Added `ResolvedTransportEntry` type.
     -  Added `PoolStrategy` type for built-in strategies.
     -  Added `Strategy` interface for custom routing logic.
     -  Added `TransportSelection` interface.
     -  Added `RoundRobinStrategy` class for equal distribution.
     -  Added `WeightedStrategy` class for proportional distribution.
     -  Added `PriorityStrategy` class for failover-based routing.
     -  Added `SelectorBasedStrategy` class for content-based routing.
     -  Support for round-robin, weighted, priority, and selector-based
        strategies.
     -  Automatic failover and retry logic with configurable limits.
     -  Comprehensive error aggregation across multiple providers.

[#8]: https://github.com/dahlia/upyo/issues/8

### @upyo/plunk

 -  Added [Plunk] transport.  [[#11]]

     -  Added `PlunkTransport` class.
     -  Added `PlunkConfig` interface.
     -  Added `ResolvedPlunkConfig` interface.
     -  Added `PlunkError` interface.
     -  Added `PlunkResponse` interface.
     -  Support for both cloud-hosted and self-hosted Plunk instances.

[Plunk]: https://www.useplunk.com/
[#11]: https://github.com/dahlia/upyo/issues/11

### @upyo/resend

 -  Added [Resend] transport.  [[#9]]

     -  Added `ResendTransport` class.
     -  Added `ResendConfig` interface.
     -  Added `ResolvedResendConfig` interface.
     -  Added `ResendApiError` interface.
     -  Added `ResendBatchResponse` interface.
     -  Added `ResendError` interface.
     -  Added `ResendResponse` interface.

[Resend]: https://resend.com/
[#9]: https://github.com/dahlia/upyo/issues/9


Version 0.2.4
-------------

Released on December 13, 2025.

### @upyo/core

 -  Fixed a potential SMTP command injection vulnerability.

    Email addresses are now validated to prevent newline characters (`\r` or
    `\n`), which could be used to inject malicious SMTP commands.


Version 0.2.3
-------------

Released on December 12, 2025.

### @upyo/ses

 -  Fixed headers serialization issue on edge runtimes.  [[#15]]

    The SES transport now converts the `Headers` object to a plain object
    before passing to `fetch()`, which resolves “Missing Authentication
    Token” errors on edge runtimes like Bunny CDN Edge that don't properly
    serialize `Headers` objects.


Version 0.2.2
-------------

Released on November 3, 2025.

### @upyo/smtp

 -  Added STARTTLS support for secure connection upgrade.  The SMTP transport
    now automatically detects and uses STARTTLS when connecting to servers
    that advertise this capability (such as Protonmail, Office 365, and others).
    This allows using port 587 with `secure: false` for automatic encryption
    upgrade.  [[#14]]


Version 0.2.1
-------------

Released on August 4, 2025.

### @upyo/smtp

 -  Fixed “Maximum call stack size exceeded” error when sending large
    attachments.  [[#6]]

    The SMTP transport now uses `Buffer.from().toString('base64')` instead of
    the legacy `btoa()` function for base64 encoding, which resolves stack
    overflow issues with large attachments (e.g., 500KB+ files).

 -  Fixed UTF-8 encoding issue where email addresses were incorrectly encoded
    in SMTP headers.  [[#7]]

    Only display names are now encoded using RFC 2047 encoding, while email
    addresses remain unencoded. For example, `German ÄÖÜ <info@example.com>`
    now correctly becomes `=?UTF-8?B?...?= <info@example.com>` instead of
    encoding the entire string including the email address.

[#6]: https://github.com/dahlia/upyo/issues/6
[#7]: https://github.com/dahlia/upyo/issues/7


Version 0.2.0
-------------

Released on July 17, 2025.

### @upyo/core

 -  Improved type safety by making array fields readonly.

     -  Changed the type of `Message.recipients` property from `Address[]` to
        `readonly Address[]`.
     -  Changed the type of `Message.ccRecipients` property from `Address[]` to
        `readonly Address[]`.
     -  Changed the type of `Message.bccRecipients` property from `Address[]` to
        `readonly Address[]`.
     -  Changed the type of `Message.replyRecipients` property from `Address[]`
        to `readonly Address[]`.
     -  Changed the type of `Message.attachments` property from `Attachment[]`
        to `readonly Attachment[]`.
     -  Changed the type of `Message.tags` property from `string[]` to
        `readonly string[]`.

 -  Enhanced email address type safety with template literal types.

     -  Added `EmailAddress` type.
     -  Changed `Address.address` property type from `string` to `EmailAddress`.
     -  Added `isEmailAddress()` type guard function for runtime email
        validation.

### @upyo/ses

 -  Added Amazon SES transport.  [[#3]]

     -  Added `SesTransport` class.
     -  Added `SesConfig` interface.
     -  Added `SesAuthentication` interface.

[#3]: https://github.com/dahlia/upyo/issues/3

### @upyo/opentelemetry

 -  Added OpenTelemetry observability support.  [[#5]]

     -  Added `OpenTelemetryTransport` class.
     -  Added `OpenTelemetryConfig` interface.
     -  Added `ObservabilityConfig` interface.
     -  Added `MetricsConfig` interface.
     -  Added `TracingConfig` interface.
     -  Added `AttributeExtractor` type.
     -  Added `ErrorClassifier` type.
     -  Added `createErrorClassifier()` function.
     -  Added `defaultErrorClassifier()` function.
     -  Added `AutoConfig` interface.
     -  Added `createOpenTelemetryTransport()` function.
     -  Added `CreateOpenTelemetryTransportConfig` interface.
     -  Added `createEmailAttributeExtractor()` function.

[#5]: https://github.com/dahlia/upyo/issues/5


Version 0.1.2
-------------

Released on Nowember 3, 2025.

### @upyo/smtp

 -  Added STARTTLS support for secure connection upgrade.  The SMTP transport
    now automatically detects and uses STARTTLS when connecting to servers
    that advertise this capability (such as Protonmail, Office 365, and others).
    This allows using port 587 with `secure: false` for automatic encryption
    upgrade.  [[#14]]


Version 0.1.1
-------------

Released on July 14, 2025.

### @upyo/smtp

 -  Fixed CJK character encoding corruption in SMTP transport HTML emails.
    Korean, Japanese, and Chinese characters are now properly encoded using
    UTF-8 quoted-printable encoding.  [[#4]]

[#4]: https://github.com/dahlia/upyo/issues/4


Version 0.1.0
-------------

Initial release.  Released on July 13, 2025.

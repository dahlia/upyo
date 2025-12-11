Upyo changelog
==============

Version 0.3.3
-------------

To be released.


Version 0.3.2
-------------

Released on December 12, 2025.

### @upyo/ses

 -  Fixed headers serialization issue on edge runtimes.  [[#15]]

    The SES transport now converts the `Headers` object to a plain object
    before passing to `fetch()`, which resolves “Missing Authentication Token”
    errors on edge runtimes like Bunny CDN Edge that don't properly serialize
    `Headers` objects.


Version 0.3.1
-------------

Released on November 3, 2025.

### @upyo/smtp

 -  Added STARTTLS support for secure connection upgrade.  The SMTP transport
    now automatically detects and uses STARTTLS when connecting to servers
    that advertise this capability (such as Protonmail, Office 365, and others).
    This allows using port 587 with `secure: false` for automatic encryption
    upgrade.  [[#14]]


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


Version 0.2.3
-------------

Released on December 12, 2025.

### @upyo/ses

 -  Fixed headers serialization issue on edge runtimes.  [[#15]]

    The SES transport now converts the `Headers` object to a plain object
    before passing to `fetch()`, which resolves “Missing Authentication Token”
    errors on edge runtimes like Bunny CDN Edge that don't properly serialize
    `Headers` objects.

[#15]: https://github.com/dahlia/upyo/issues/15


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

[#14]: https://github.com/dahlia/upyo/issues/14


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

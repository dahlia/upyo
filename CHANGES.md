Upyo changelog
==============

Version 0.3.0
-------------

To be released.

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

Upyo changelog
==============

Version 0.2.0
-------------

To be released.

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

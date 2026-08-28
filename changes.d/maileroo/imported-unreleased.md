---
links:
  '#30': https://github.com/dahlia/upyo/issues/30
  '#31': https://github.com/dahlia/upyo/pull/31
---
 -  Added [Maileroo] transport.
    [[#30], [#31]]

     -  Added `MailerooTransport` class.
     -  Added `MailerooConfig` interface.
     -  Added `ResolvedMailerooConfig` type.
     -  Added `MailerooApiError` class.
     -  Added `MailerooTimeoutError` class.
     -  Supports single sends, sequential `sendMany()`, attachments, inline
        images, custom headers, tags, tracking settings, retries, structured
        failure receipts, and `AbortSignal` cancellation.

[Maileroo]: https://maileroo.com/

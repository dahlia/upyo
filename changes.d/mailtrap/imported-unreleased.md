---
links:
  '#32': https://github.com/dahlia/upyo/pull/32
---
 -  Added [Mailtrap] transport.
    [[#32] by Narek Hovhannisyan\]

     -  Added `MailtrapTransport` class.
     -  Added `MailtrapConfig` interface.
     -  Added `ResolvedMailtrapConfig` type.
     -  Added `MailtrapApiError` class.
     -  Added `MailtrapTimeoutError` class.
     -  Supports Email API and Email Sandbox sending, batch sends,
        attachments, categories, custom variables, config-level metadata,
        structured failure receipts, and `AbortSignal` cancellation.

[Mailtrap]: https://mailtrap.io/

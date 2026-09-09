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
     -  Added `MailtrapResponseError` class for unreadable successful responses.
        These failures are not retried, and their failure receipts are marked
        as non-retryable, including when reading the response times out.
     -  Supports Email API and Email Sandbox sending, batch sends,
        attachments, categories, custom variables, config-level metadata,
        structured failure receipts, and `AbortSignal` cancellation.

[Mailtrap]: https://mailtrap.io/

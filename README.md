<!-- deno-fmt-ignore-file -->

Upyo
====

> [!CAUTION]
> This project is in early development and subject to change without notice.

Upyo is a simple and cross-runtime library for sending email messages using
SMTP and various email providers.  It works on Node.js, Deno, Bun, and edge
functions.


Packages
--------

Upyo is a monorepo which contains several packages.  The main package is
*@upyo/core*, which provides the shared types and common interfaces for
sending email messages.  Other packages implement specific transports for
sending messages.  The following is a list of the available packages:

| Package       | JSR                      | npm                      | Description                                    |
| ------------- | ------------------------ | ------------------------ | ---------------------------------------------- |
| @upyo/core    | [JSR][jsr:@upyo/core]    | [npm][npm:@upyo/core]    | Shared types and interfaces for email messages |
| @upyo/smtp    | [JSR][jsr:@upyo/smtp]    | [npm][npm:@upyo/smtp]    | SMTP transport                                 |
| @upyo/mailgun | [JSR][jsr:@upyo/mailgun] | [npm][npm:@upyo/mailgun] | Mailgun transport                              |

[jsr:@upyo/core]: https://jsr.io/@upyo/core
[npm:@upyo/core]: https://www.npmjs.com/package/@upyo/core
[jsr:@upyo/smtp]: https://jsr.io/@upyo/smtp
[npm:@upyo/smtp]: https://www.npmjs.com/package/@upyo/smtp
[jsr:@upyo/mailgun]: https://jsr.io/@upyo/mailgun
[npm:@upyo/mailgun]: https://www.npmjs.com/package/@upyo/mailgun


Etymology
---------

The name <q>Upyo</q> is derived from the Korean word <q>郵票</q> (upyo),
which means *postage stamp*.  It reflects the library's purpose of sending
email messages, similar to how a postage stamp is used to send physical mail.

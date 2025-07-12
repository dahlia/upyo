Getting started
===============

This guide will help you set up Upyo in your project and send your first email.


Installation
------------

To install Upyo, you can use your preferred package manager. Upyo is available
on JSR and npm, so you can choose the one that fits your project best:

::: code-group

~~~~ sh [npm]
npm add @upyo/core
~~~~

~~~~ sh [pnpm]
pnpm add @upyo/core
~~~~

~~~~ sh [Yarn]
yarn add @upyo/core
~~~~

~~~~ sh [Deno]
deno add jsr:@upyo/core
~~~~

~~~~ sh [Bun]
bun add @upyo/core
~~~~

:::


Choosing a transport
--------------------

Upyo supports various transports for sending emails. The most common one would
be SMTP, but you can also use providers like Mailgun.  You need to install
the transport package you want to use. For example, to use the SMTP transport,
you would install the *@upyo/smtp* package:

::: code-group

~~~~ sh [npm]
npm add @upyo/smtp
~~~~

~~~~ sh [pnpm]
pnpm add @upyo/smtp
~~~~

~~~~ sh [Yarn]
yarn add @upyo/smtp
~~~~

~~~~ sh [Deno]
deno add jsr:@upyo/smtp
~~~~

~~~~ sh [Bun]
bun add @upyo/smtp
~~~~

:::

> [!CAUTION]
> The SMTP transport currently does not support edge functions or web browsers.
> If you need to use Upyo in these environments, consider using other transports
> like Mailgun or similar services that provide HTTP APIs.


Sending your first email
------------------------

Once you have installed the core package and the transport you want to use,
you can start sending emails. Here's a basic example using Gmail through SMTP:

~~~~ typescript twoslash
import { createMessage } from "@upyo/core";
import { SmtpTransport } from "@upyo/smtp";

const transport = new SmtpTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true, // Use TLS
  auth: {
    user: "your@gmail.com",
    pass: "your-app-password",
  }
});

const message = createMessage({
  from: "sender@example.com",
  to: "recipient@example.net",
  subject: "Hello from Upyo!",
  content: { text: "This is a test email." },
});

const receipt = await transport.send(message);
console.log("Email sent:", receipt.successful);
~~~~

That's it! You have sent your first email using Upyo. You can customize
the message with HTML content, attachments, and more.

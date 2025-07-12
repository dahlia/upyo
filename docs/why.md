Why Upyo?
=========

Upyo (pronounced /oo-pee-oh/) is a modern email library designed to simplify
is a simple and modern email library that works across multiple runtimes
including Node.js, Deno, Bun, and edge functions. It provides a universal
interface for email delivery, making it easy to send emails with minimal setup.


Cross-runtime compatibility
---------------------------

Upyo is designed to work seamlessly across different JavaScript runtimes.
Whether you're using Node.js, Deno, Bun, or deploying to edge functions,
Upyo provides a consistent API for sending emails. This means you can write
your email sending code once and run it anywhere without worrying about
runtime-specific details.


Lightweight and dependency-free
-------------------------------

Upyo has zero dependencies, making it lightweight and easy to integrate into
your projects. You don't have to worry about managing additional packages or
bloat. Upyo is designed to be minimalistic, focusing solely on email delivery
without unnecessary complexity.


Dead simple API
---------------

Upyo provides a straightforward and intuitive API for sending emails. You can
send emails with just a few lines of code, without needing to understand
complex configurations or setups. The API is designed to be easy to use, so you
can focus on building your application rather than dealing with email delivery
intricacies.

Here's a quick example of sending an email with Upyo:

~~~~ typescript twoslash
import { createMessage } from "@upyo/core";
import { MailgunTransport } from "@upyo/mailgun";
import process from "node:process";

const message = createMessage({
  from: "sender@example.com",
  to: "recipient@example.net",
  subject: "Hello from Upyo!",
  content: { text: "This is a test email." },
});

const transport = new MailgunTransport({
  apiKey: process.env.MAILGUN_KEY!,
  domain: process.env.MAILGUN_DOMAIN!,
  region: process.env.MAILGUN_REGION as "us" | "eu",
});

const receipt = await transport.send(message);
if (receipt.successful) {
  console.log("Message sent with ID:", receipt.messageId);
} else {
  console.error("Send failed:", receipt.errorMessages.join(", "));
}
~~~~


Built for testing
-----------------

Upyo is designed with testing in mind. The [*@upyo/mock*](./transports/mock.md)
transport provides a comprehensive testing solution that lets you verify email
functionality without sending real emails. You can inspect sent messages,
simulate network delays and failures, and test complex async email workflows
with confidence.

The mock transport implements the same interface as real transports, making it
a drop-in replacement for testing. This means you can write reliable tests that
verify your email logic works correctly across all scenarios:

~~~~ typescript twoslash
import { createMessage } from "@upyo/core";
import { MockTransport } from "@upyo/mock";

// Use mock transport in tests - same interface, no real emails
const transport = new MockTransport();

const message = createMessage({
  from: "sender@example.com",
  to: "recipient@example.net",
  subject: "Test Email",
  content: { text: "This is a test." },
});

const receipt = await transport.send(message);

// Verify the email was "sent" successfully
console.log(receipt.successful); // true

// Inspect what was sent for testing assertions
const sentMessages = transport.getSentMessages();
console.log(sentMessages[0].subject); // "Test Email"
console.log(sentMessages[0].recipients[0].address); // "recipient@example.net"
~~~~


Provider independence
---------------------

Upyo's transport abstraction means you're never locked into a single email
service provider. Whether you use [SMTP](./transports/smtp.md),
[Mailgun](./transports/mailgun.md), [SendGrid](./transports/sendgrid.md),
or any future provider, your application code stays exactly the same.
Switch providers in minutes, not days:

~~~~ typescript twoslash
import { createMessage } from "@upyo/core";
import { SmtpTransport } from "@upyo/smtp";
import { MailgunTransport } from "@upyo/mailgun";

const message = createMessage({
  from: "sender@example.com",
  to: "recipient@example.net",
  subject: "Hello from Upyo!",
  content: { text: "This works with any transport!" },
});

// Start with SMTP for development
const smtpTransport = new SmtpTransport({
  host: "localhost",
  port: 1025,
});

// Switch to Mailgun for production - same interface!
const mailgunTransport = new MailgunTransport({
  apiKey: "your-api-key",
  domain: "your-domain.com",
});

// Your application code never changes
async function sendEmail(transport: any) {
  const receipt = await transport.send(message);
  return receipt.successful ? receipt.messageId : receipt.errorMessages;
}

// Works identically with any transport
await sendEmail(smtpTransport);   // ✅ Works
await sendEmail(mailgunTransport); // ✅ Works
~~~~

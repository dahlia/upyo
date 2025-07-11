Why Upyo?
=========

Upyo is a simple and modern email sending library that works across multiple
runtimes like Node.js, Deno, Bun, and edge functions. It provides a universal
interface for emailing, making it easy to send emails with minimal setup.


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
your projects.  You don't have to worry about managing additional packages or
bloat.  Upyo is designed to be minimalistic, focusing solely on the task of
sending emails without unnecessary complexity.


Dead simple API
---------------

Upyo provides a straightforward and intuitive API for sending emails. You can
send emails with just a few lines of code, without needing to understand
complex configurations or setups. The API is designed to be easy to use, so you
can focus on building your application rather than dealing with email
sending intricacies.

See the below example for a quick demo of sending an email using Upyo:

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

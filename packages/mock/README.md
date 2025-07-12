<!-- deno-fmt-ignore-file -->

@upyo/mock
==========

[![JSR][JSR badge]][JSR]
[![npm][npm badge]][npm]

Mock transport for the [Upyo] email library - perfect for testing email functionality without actually sending emails.

[JSR]: https://jsr.io/@upyo/mock
[JSR badge]: https://jsr.io/badges/@upyo/mock
[npm]: https://www.npmjs.com/package/@upyo/mock
[npm badge]: https://img.shields.io/npm/v/@upyo/mock?logo=npm
[Upyo]: https://upyo.org/


Features
--------

 -  *Memory-based storage*: Stores "sent" messages in memory for verification
 -  *Configurable behavior*: Simulate delays, failures, and custom responses
 -  *Rich testing API*: Query, filter, and wait for messages in tests
 -  *Type-safe*: Full TypeScript support with readonly interfaces
 -  *Cross-runtime*: Works on Deno, Node.js, Bun, and edge functions


Installation
------------

~~~~ sh
npm  add       @upyo/core @upyo/mock
pnpm add       @upyo/core @upyo/mock
yarn add       @upyo/core @upyo/mock
deno add --jsr @upyo/core @upyo/mock
bun  add       @upyo/core @upyo/mock
~~~~


Usage
-----

### Basic testing

~~~~ typescript
import { createMessage } from "@upyo/core";
import { MockTransport } from "@upyo/mock";

// Create a mock transport
const transport = new MockTransport();

const message = createMessage({
  from: "sender@example.com",
  to: "recipient@example.com",
  subject: "Test Email",
  content: { text: "This is a test email." },
});

// "Send" the email (it will be stored in memory)
const receipt = await transport.send(message);

// Verify the result
console.log(receipt.successful); // true
console.log(receipt.messageId); // "mock-message-1"

// Check what was sent
const sentMessages = transport.getSentMessages();
console.log(sentMessages.length); // 1
console.log(sentMessages[0].subject); // "Test Email"
~~~~

### Advanced configuration

~~~~ typescript
import { MockTransport } from "@upyo/mock";

const transport = new MockTransport({
  // Simulate network delay
  delay: 100,

  // Or use random delays
  randomDelayRange: { min: 50, max: 200 },

  // Simulate random failures (10% failure rate)
  failureRate: 0.1,

  // Custom default response
  defaultResponse: {
    successful: true,
    messageId: "custom-id-prefix"
  }
});
~~~~

### Testing with failures

~~~~ typescript
const transport = new MockTransport();

// Set up a specific failure for the next send
transport.setNextResponse({
  successful: false,
  errorMessages: ["Invalid recipient address"]
});

const receipt = await transport.send(message);
console.log(receipt.successful); // false
console.log(receipt.errorMessages); // ["Invalid recipient address"]
~~~~

### Message querying and filtering

~~~~ typescript
const transport = new MockTransport();

// Send some test messages
await transport.send(createMessage({
  from: "sender@example.com",
  to: "user1@example.com",
  subject: "Welcome User 1",
  content: { text: "Welcome!" }
}));

await transport.send(createMessage({
  from: "sender@example.com",
  to: "user2@example.com",
  subject: "Welcome User 2",
  content: { text: "Welcome!" }
}));

// Query sent messages
const allMessages = transport.getSentMessages();
console.log(allMessages.length); // 2

const user1Messages = transport.getMessagesTo("user1@example.com");
console.log(user1Messages.length); // 1

const welcomeMessages = transport.getMessagesBySubject("Welcome User 1");
console.log(welcomeMessages.length); // 1

// Custom filtering
const textMessages = transport.findMessagesBy(msg =>
  "text" in msg.content && msg.content.text.includes("Welcome")
);
console.log(textMessages.length); // 2
~~~~

### Async testing utilities

~~~~ typescript
const transport = new MockTransport();

// Wait for a specific number of messages
const waitPromise = transport.waitForMessageCount(3, 5000); // 5 second timeout

// Send messages from elsewhere in your code...
setTimeout(() => transport.send(message1), 100);
setTimeout(() => transport.send(message2), 200);
setTimeout(() => transport.send(message3), 300);

await waitPromise; // Resolves when 3 messages are sent

// Wait for a specific message
const specificMessage = await transport.waitForMessage(
  msg => msg.subject === "Important Alert",
  3000 // 3 second timeout
);
~~~~

### Cleanup and reset

~~~~ typescript
const transport = new MockTransport();

// Send some messages and configure behavior
await transport.send(message);
transport.setDelay(100);
transport.setFailureRate(0.2);

// Clear just the sent messages
transport.clearSentMessages();
console.log(transport.getSentMessagesCount()); // 0

// Or reset everything to initial state
transport.reset(); // Clears messages and resets all configuration
~~~~

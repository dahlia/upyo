<!-- deno-fmt-ignore-file -->

Custom transport
================

A custom transport allows you to integrate any email service with Upyo by
implementing the simple `Transport` interface. Whether you're connecting to
a proprietary email API, adding specialized logging, or building testing
utilities, custom transports provide the flexibility you need.

Upyo's transport abstraction ensures that custom implementations work
seamlessly alongside built-in transports like [SMTP](./smtp.md),
[Mailgun](./mailgun.md), and [SendGrid](./sendgrid.md).
Your application code remains unchanged when switching between different
email providers.

This guide walks you through the implementation patterns and best practices
for creating robust, production-ready custom transports.


When to create a custom transport
---------------------------------

Consider creating a custom transport when:

 -  You need to integrate with an email service not supported by Upyo
 -  Your organization has internal email systems with custom APIs
 -  You require specialized behavior (logging, metrics, preprocessing)
 -  You want to create transport for testing specific scenarios


Understanding the `Transport` interface
---------------------------------------

The `Transport` interface is the foundation of Upyo's email abstraction.
It defines a simple contract that all email services must implement,
ensuring consistent behavior across different providers.

~~~~ typescript twoslash
import type { Message, Receipt, TransportOptions } from "@upyo/core";

export interface Transport {
  send(message: Message, options?: TransportOptions): Promise<Receipt>;

  sendMany(
    messages: Iterable<Message> | AsyncIterable<Message>,
    options?: TransportOptions,
  ): AsyncIterable<Receipt>;
}
~~~~

This interface is intentionally minimal, with just two methods that handle
the core email sending operations.  The design philosophy prioritizes simplicity
and reliability over feature complexity.

### Core principles

When implementing a custom transport, these principles ensure compatibility with
the Upyo ecosystem:

**Never throw exceptions from transport methods.** Instead of throwing errors,
always return `Receipt` objects that clearly indicate success or failure.
This approach provides predictable error handling and prevents uncaught
exceptions from breaking your application flow.

**Support cancellation through [`AbortSignal`].** Modern applications need the
ability to cancel long-running operations.  Check `options?.signal?.throwIfAborted()`
at strategic points in your implementation, especially before expensive
network operations.

**Return descriptive receipts.** Success receipts should include a meaningful
`messageId` that can be used for tracking and debugging.  Failure receipts
should provide specific `errorMessages` that help developers understand what
went wrong.

[`AbortSignal`]: https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal


Basic HTTP transport example
----------------------------

Most modern email services provide HTTP APIs for sending emails.  This makes
HTTP-based transports the most common type of custom implementation.

Let's build a complete transport for a fictional service called “MyService”
to demonstrate the key patterns. The example below shows all the essential
components: configuration management, HTTP communication, proper error
handling, and cancellation support.

~~~~ typescript twoslash
import type { Message, Receipt, Transport, TransportOptions } from "@upyo/core";

export interface MyServiceConfig {
  readonly apiKey: string;
  readonly baseUrl?: string;
}

export class MyServiceTransport implements Transport {
  private config: Required<MyServiceConfig>;

  constructor(config: MyServiceConfig) {
    this.config = {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl ?? "https://api.myservice.com/v1",
    };
  }

  async send(message: Message, options?: TransportOptions): Promise<Receipt> {
    // Check for cancellation
    options?.signal?.throwIfAborted();

    try {
      // Convert message to API format
      const payload = {
        from: message.sender.address,
        to: message.recipients.map(r => r.address),
        subject: message.subject,
        text: message.content.text,
        html: "html" in message.content ? message.content.html : undefined,
      };

      options?.signal?.throwIfAborted();

      // Send via API
      const response = await fetch(`${this.config.baseUrl}/send`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: options?.signal,
      });

      if (!response.ok) {
        const error = await response.text();
        return {
          successful: false,
          errorMessages: [`HTTP ${response.status}: ${error}`],
        };
      }

      const result = await response.json() as any;
      return {
        successful: true,
        messageId: result.messageId,
      };
    } catch (error) {
      return {
        successful: false,
        errorMessages: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  async *sendMany(
    messages: Iterable<Message> | AsyncIterable<Message>,
    options?: TransportOptions,
  ): AsyncIterable<Receipt> {
    for await (const message of messages) {
      options?.signal?.throwIfAborted();
      yield await this.send(message, options);
    }
  }
}
~~~~

Let's break down the key implementation details:

**Configuration with defaults:** The constructor uses a simple pattern to
provide sensible defaults while requiring only essential configuration.
This makes the transport easy to use while remaining flexible.

**Cancellation checking:** Notice how we check `options?.signal?.throwIfAborted()`
at two critical points: before starting the operation and before making the
network request. This ensures operations can be cancelled promptly.

**Error conversion:** All errors are caught and converted to failed `Receipt`
objects. This prevents exceptions from propagating and provides a consistent
error handling experience.

**HTTP error handling:** The code distinguishes between HTTP errors (4xx/5xx
status codes) and network errors, providing specific error messages for each case.

The `~Transport.sendMany()` implementation uses a simple pattern that delegates
to the `~Transport.send()` method for each message.  This approach is
straightforward and works well for most HTTP APIs that don't support batch
operations.


Advanced patterns
-----------------

### Resource cleanup

Some transports need to manage persistent resources like connection pools, file handles, or background timers. Implementing the `AsyncDisposable` interface ensures proper cleanup and integrates with modern JavaScript resource management patterns.

~~~~ typescript {22-24} twoslash
import type { Message, Receipt, Transport, TransportOptions } from "@upyo/core";

export class MyTransport implements Transport, AsyncDisposable {
  private connections: any[] = [];

  async send(message: Message, options?: TransportOptions): Promise<Receipt> {
    throw new Error("Not implemented");
  }

  async *sendMany(
    messages: Iterable<Message> | AsyncIterable<Message>,
    options?: TransportOptions,
  ): AsyncIterable<Receipt> {
    throw new Error("Not implemented");
  }

  async closeConnections(): Promise<void> {
    await Promise.all(this.connections.map(conn => conn.close()));
    this.connections = [];
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.closeConnections();
  }
}

// Usage with automatic cleanup
await using transport = new MyTransport();
// Transport automatically cleaned up when scope ends
~~~~

This pattern is particularly important for production deployments where resource
leaks can cause memory issues or exhaust connection limits. The [`await using`]
syntax automatically calls the disposal method when the transport goes out of
scope, even if an exception occurs.

[`await using`]: https://github.com/tc39/proposal-async-explicit-resource-management#await-using-declarations

### Retry logic

Network operations can fail due to temporary issues like network congestion,
server overload, or brief service outages. Implementing retry logic with
exponential backoff makes your transport more resilient in production environments.

~~~~ typescript twoslash
async function sendWithRetry(
  sendFn: () => Promise<Response>,
  maxRetries: number = 3
): Promise<Response> {
  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await sendFn();

      // Don't retry client errors (4xx)
      if (response.status >= 400 && response.status < 500) {
        throw new Error(`Client error: ${response.status}`);
      }

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === maxRetries) {
        throw lastError;
      }

      // Exponential backoff: 1s, 2s, 4s...
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}
~~~~

The retry function implements several important patterns: it avoids retrying
client errors (4xx status codes) since these indicate problems with the
request itself, uses exponential backoff to avoid overwhelming struggling
servers, and provides a configurable maximum retry count to prevent infinite loops.

> [!CAUTION]
> Never retry 4xx client errors as these indicate problems with your request
> that won't be resolved by retrying. Only retry 5xx server errors and
> network failures.

### Configuration validation

Robust configuration validation prevents runtime errors and provides clear
feedback when transports are misconfigured.  This is especially important in
production environments where configuration errors might not be discovered
until the first email is sent.

~~~~ typescript twoslash
export interface ApiConfig {
  readonly apiKey: string;
  readonly timeout?: number;
}

export function createApiConfig(config: ApiConfig): Required<ApiConfig> {
  if (!config.apiKey) {
    throw new Error("API key is required");
  }

  if (config.timeout && config.timeout < 1000) {
    throw new Error("Timeout must be at least 1000ms");
  }

  return {
    apiKey: config.apiKey,
    timeout: config.timeout ?? 30000,
  };
}
~~~~

This validation approach uses a factory function that both validates input
and applies defaults. Throwing errors during construction means configuration
problems are discovered immediately, rather than when the first email is sent.


Best practices
--------------

Following these practices ensures your custom transport integrates well with
the Upyo ecosystem and provides a reliable experience for users.

### Handle cancellation properly

Cancellation support is essential for responsive applications. Users should be able to cancel email operations that are taking too long or are no longer needed.

~~~~ typescript
// Check before expensive operations
options?.signal?.throwIfAborted();

// Pass to network calls
await fetch(url, { signal: options?.signal });
~~~~

Check for cancellation before starting expensive operations and pass the signal
to any network calls.  This ensures operations can be cancelled promptly and
resources aren't wasted.

### Always return receipts, never throw

Consistent error handling is a core principle of the `Transport` interface.
Users should never have to catch exceptions from transport methods.

~~~~ typescript [✅ Good]
try {
  const result = await sendEmail();
  return { successful: true, messageId: result.id };
} catch (error) {
  return { successful: false, errorMessages: [error.message] };
}
~~~~

~~~~ typescript [❌ Bad: don't throw from send()]
async send(message: Message): Promise<Receipt> {
  throw new Error("Something went wrong");
}
~~~~

This approach provides predictable error handling and allows users to handle errors consistently across all transports.

### Use web standards for cross-runtime compatibility

Upyo runs on Node.js, Deno, Bun, and edge functions.  Using web standards
ensures your transport works everywhere.

~~~~ typescript [✅ Good: works everywhere]
globalThis.fetch()
AbortController()
setTimeout()
~~~~

~~~~ typescript [❌ Bad: Node.⁠js specific]
import http from "node:http"
~~~~

Avoid runtime-specific APIs and prefer web standards that are universally supported.

### Provide sensible configuration defaults

Good defaults make your transport easy to use while still allowing customization
when needed.

~~~~ typescript
export function createConfig(config: Config): ResolvedConfig {
  return {
    ...config,
    timeout: config.timeout ?? 30000,
    retries: config.retries ?? 3,
    baseUrl: config.baseUrl ?? "https://api.example.com",
  };
}
~~~~

Use factory functions to apply defaults and validate configuration.
This pattern makes misconfiguration errors visible early and provides
a better developer experience.

With these patterns, your custom transport will integrate seamlessly with Upyo's
ecosystem and provide a consistent, reliable experience for users.


Sharing your transport
---------------------

If you've built a transport that others might find useful, consider sharing
it with the community! There are several ways to make your custom transport
available to other developers.

### Publishing as a package

You can package and publish your transport as a standalone npm package or
JSR module. When publishing, follow the naming convention
*@yourorg/upyo-servicename* to make it easy for users to discover.

Look at existing transport packages in the Upyo repository for reference on
package structure, documentation, and testing patterns. Each transport package
includes proper TypeScript definitions, comprehensive tests, and clear usage
examples.

Make sure to add *@upyo/core* as a peer dependency in your *package.json*
rather than a regular dependency. This ensures users can control the core
version and avoids potential version conflicts:

~~~~ json
{
  "peerDependencies": {
    "@upyo/core": "^0.1.0"
  }
}
~~~~

### Contributing to Upyo

We welcome contributions of new transport packages to the main Upyo repository!
If you've implemented a transport for a popular email service, don't hesitate
to submit a pull request—we'd love to see what you've built.

While we have established patterns like comprehensive test coverage, proper
TypeScript types, clear documentation, and cross-runtime support, you don't
need to have everything perfect before contributing. Our maintainers are happy
to help you polish your implementation and bring it up to project standards.

Feel free to open a draft PR early in your development process if you'd like
feedback or guidance. Check the existing transport implementations for examples,
but remember that we're here to help you succeed!

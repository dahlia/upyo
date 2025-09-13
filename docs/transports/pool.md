---
description: >-
  Pool transport for combining multiple email providers with load balancing,
  failover strategies, and intelligent routing to ensure reliable email delivery.
---

Pool transport
==============

The pool transport is a specialized orchestration utility that combines multiple
email transports into a single, resilient email delivery system. Rather than
connecting to a specific email service, it intelligently routes messages across
multiple underlying transports using configurable strategies like round-robin,
weighted distribution, priority-based failover, and custom routing logic.
This makes it invaluable for high-availability systems, cost optimization,
and gradual migration between email providers.

Upyo provides a comprehensive pool transport through the *@upyo/pool* package,
offering multiple load balancing strategies, automatic failover, resource
management, and full compatibility with all Upyo transport features.


Installation
------------

To use the pool transport, you need to install the *@upyo/pool* package:

::: code-group

~~~~ sh [npm]
npm add @upyo/pool
~~~~

~~~~ sh [pnpm]
pnpm add @upyo/pool
~~~~

~~~~ sh [Yarn]
yarn add @upyo/pool
~~~~

~~~~ sh [Deno]
deno add jsr:@upyo/pool
~~~~

~~~~ sh [Bun]
bun add @upyo/pool
~~~~

:::


Basic pooling
-------------

The pool transport implements the same `Transport` interface as all other Upyo
transports, making it a drop-in replacement that can combine multiple email
providers seamlessly. You can group transports from different providers and
use them as a single unit:

~~~~ typescript twoslash
import { PoolTransport } from "@upyo/pool";
import { createMessage } from "@upyo/core";
import { SmtpTransport } from "@upyo/smtp";
import { MailgunTransport } from "@upyo/mailgun";
import { SendGridTransport } from "@upyo/sendgrid";

// Create individual transports
const smtpTransport = new SmtpTransport({
  host: "smtp.example.com",
  port: 587,
  auth: { user: "user", pass: "pass" },
});

const mailgunTransport = new MailgunTransport({
  apiKey: "your-mailgun-api-key",
  domain: "your-domain.com",
});

const sendgridTransport = new SendGridTransport({
  apiKey: "your-sendgrid-api-key",
});

// Combine them into a pool with round-robin strategy
const poolTransport = new PoolTransport({
  strategy: "round-robin",
  transports: [
    { transport: smtpTransport },
    { transport: mailgunTransport },
    { transport: sendgridTransport },
  ],
});

const message = createMessage({
  from: "sender@example.com",
  to: "recipient@example.com",
  subject: "Pooled Email Delivery",
  content: { text: "This email was sent through a pool of providers." },
});

// Send through the pool (will use round-robin selection)
const receipt = await poolTransport.send(message);

console.log(receipt.successful); // true
if (receipt.successful) {
  console.log(receipt.messageId); // ID from whichever provider was used
}
~~~~

The pool automatically handles provider selection, error aggregation, and
resource management, giving you a single interface for multiple email services.


Load balancing strategies
-------------------------

Different applications need different approaches to distributing email traffic.
The pool transport provides four built-in strategies, each optimized for
specific use cases:

### Round-robin distribution

Cycles through transports in order, ensuring perfectly even distribution:

~~~~ typescript twoslash
import type { Transport } from "@upyo/core";
import { PoolTransport } from "@upyo/pool";
import { MockTransport } from "@upyo/mock";
const transport1: Transport = new MockTransport();
const transport2: Transport = new MockTransport();
const transport3: Transport = new MockTransport();
// ---cut-before---
const pool = new PoolTransport({
  strategy: "round-robin",
  transports: [
    { transport: transport1 },
    { transport: transport2 },
    { transport: transport3 },
  ],
});

// First message goes to transport1
// Second message goes to transport2
// Third message goes to transport3
// Fourth message goes to transport1 again
// And so on...
~~~~

Round-robin is perfect when you want equal load distribution and have providers
with similar capabilities and costs.

### Weighted distribution

Distributes traffic proportionally based on configured weights, allowing you
to send more traffic through preferred or higher-capacity providers:

~~~~ typescript twoslash
import type { Transport } from "@upyo/core";
const primaryProvider = {} as Transport;
const secondaryProvider = {} as Transport;
const backupProvider = {} as Transport;
// ---cut-before---
import { PoolTransport } from "@upyo/pool";

const pool = new PoolTransport({
  strategy: "weighted",
  transports: [
    { transport: primaryProvider, weight: 5 },    // Gets ~71% of traffic
    { transport: secondaryProvider, weight: 2 },  // Gets ~29% of traffic
    { transport: backupProvider, weight: 0 },     // Gets no traffic (disabled)
  ],
});

// Traffic is distributed randomly but proportionally to weights
// Over many sends, primaryProvider gets 5/(5+2+0) ≈ 71% of messages
// secondaryProvider gets 2/(5+2+0) ≈ 29% of messages
~~~~

Weighted distribution is ideal for cost optimization, capacity management,
or gradual migration between providers.

### Priority-based failover

Always attempts the highest priority transport first, falling back to lower
priorities only when higher ones fail:

~~~~ typescript twoslash
import type { Transport } from "@upyo/core";
const primaryTransport = {} as Transport;
const secondaryTransport = {} as Transport;
const emergencyTransport = {} as Transport;
// ---cut-before---
import { PoolTransport } from "@upyo/pool";

const pool = new PoolTransport({
  strategy: "priority",
  transports: [
    { transport: primaryTransport, priority: 100 },
    { transport: secondaryTransport, priority: 50 },
    { transport: emergencyTransport, priority: 10 },
  ],
  maxRetries: 3, // Try up to 3 different transports
});

// Always tries primaryTransport first
// If it fails, tries secondaryTransport
// If that fails too, tries emergencyTransport
// If all fail, returns aggregated error messages
~~~~

Priority-based routing ensures you always use your preferred provider when
possible, with automatic failover to backup systems.

### Custom routing with selectors

Routes messages based on custom logic, allowing content-based or rule-based
email provider selection:

~~~~ typescript twoslash
import type { Transport } from "@upyo/core";
const bulkEmailProvider = {} as Transport;
const transactionalProvider = {} as Transport;
const euProvider = {} as Transport;
const defaultProvider = {} as Transport;
// ---cut-before---
import { PoolTransport } from "@upyo/pool";

const pool = new PoolTransport({
  strategy: "selector-based",
  transports: [
    {
      transport: bulkEmailProvider,
      selector: (msg) => msg.tags?.includes("newsletter"),
    },
    {
      transport: transactionalProvider,
      selector: (msg) => msg.priority === "high",
    },
    {
      transport: euProvider,
      selector: (msg) => msg.headers.get("region") === "EU",
    },
    {
      transport: defaultProvider, // No selector - catches everything else
    },
  ],
});

// Newsletter emails automatically use bulkEmailProvider
// High-priority emails use transactionalProvider
// EU-region emails use euProvider
// Everything else uses defaultProvider
~~~~

Selector-based routing enables sophisticated email routing based on content,
metadata, recipient domains, or any custom logic.


Failover and retry logic
------------------------

Real email services occasionally fail due to network issues, rate limits,
or maintenance. The pool transport provides robust failover capabilities
that automatically retry failed sends using different providers:

~~~~ typescript twoslash
import type { Transport, Message } from "@upyo/core";
import { PoolTransport } from "@upyo/pool";
const unreliableProvider = {} as Transport;
const reliableProvider = {} as Transport;
const backupProvider = {} as Transport;
const message = {} as Message;
// ---cut-before---

const pool = new PoolTransport({
  strategy: "priority",
  transports: [
    { transport: unreliableProvider, priority: 100 },
    { transport: reliableProvider, priority: 50 },
    { transport: backupProvider, priority: 10 },
  ],
  maxRetries: 3,           // Try up to 3 different transports
  timeout: 10000,          // 10-second timeout per attempt
});

// If unreliableProvider fails, automatically tries reliableProvider
// If that fails too, tries backupProvider
// If all fail, returns aggregated error messages from all attempts
const receipt = await pool.send(message);

if (!receipt.successful) {
  // Contains error messages from all failed attempts
  console.error("All providers failed:", receipt.errorMessages);
  // Example: [
  //   "Provider 1: Connection timeout",
  //   "Provider 2: Rate limit exceeded",
  //   "Provider 3: Invalid API key"
  // ]
}
~~~~

The pool aggregates error messages from all failed attempts, giving you
complete visibility into what went wrong across all providers.


Custom strategies
-----------------

For advanced use cases, you can implement custom routing strategies by
creating a class that implements the `Strategy` interface. This allows
you to build sophisticated routing logic based on any criteria:

~~~~ typescript twoslash
import { PoolTransport, type Strategy, type TransportSelection } from "@upyo/pool";
import type { Message, Transport } from "@upyo/core";
import type { ResolvedTransportEntry } from "@upyo/pool";
const cheapProvider = {} as Transport;
const premiumProvider = {} as Transport;
const usProvider = {} as Transport;
const euProvider = {} as Transport;
const globalProvider = {} as Transport;
// ---cut-before---

class TimeBasedStrategy implements Strategy {
  select(
    message: Message,
    transports: readonly ResolvedTransportEntry[],
    attemptedIndices: Set<number>
  ): TransportSelection | undefined {
    const hour = new Date().getHours();

    // Use different providers based on time of day
    // Morning hours: use provider 0 (cheaper bulk rates)
    // Evening hours: use provider 1 (better deliverability)
    const preferredIndex = hour < 12 ? 0 : 1;

    if (!attemptedIndices.has(preferredIndex) &&
        transports[preferredIndex]?.enabled) {
      return {
        entry: transports[preferredIndex],
        index: preferredIndex,
      };
    }

    // Fallback to any available transport
    for (let i = 0; i < transports.length; i++) {
      if (!attemptedIndices.has(i) && transports[i].enabled) {
        return { entry: transports[i], index: i };
      }
    }

    return undefined;
  }

  reset() {
    // Custom reset logic if needed
  }
}

class RegionBasedStrategy implements Strategy {
  select(
    message: Message,
    transports: readonly ResolvedTransportEntry[],
    attemptedIndices: Set<number>
  ): TransportSelection | undefined {
    // Route based on recipient domain
    const recipient = message.recipients[0]?.address;
    const domain = recipient?.split('@')[1];

    let preferredIndex = 0;

    if (domain?.endsWith('.eu') || domain?.endsWith('.de')) {
      preferredIndex = 1; // EU provider
    } else if (domain?.endsWith('.com') || domain?.endsWith('.org')) {
      preferredIndex = 0; // US provider
    } else {
      preferredIndex = 2; // Global provider
    }

    if (!attemptedIndices.has(preferredIndex) &&
        transports[preferredIndex]?.enabled) {
      return {
        entry: transports[preferredIndex],
        index: preferredIndex,
      };
    }

    // Fallback logic...
    for (let i = 0; i < transports.length; i++) {
      if (!attemptedIndices.has(i) && transports[i].enabled) {
        return { entry: transports[i], index: i };
      }
    }

    return undefined;
  }

  reset() {}
}

// Use custom strategies
const timeBasedPool = new PoolTransport({
  strategy: new TimeBasedStrategy(),
  transports: [
    { transport: cheapProvider },     // Used in mornings
    { transport: premiumProvider },   // Used in evenings
  ],
});

const regionBasedPool = new PoolTransport({
  strategy: new RegionBasedStrategy(),
  transports: [
    { transport: usProvider },       // .com, .org domains
    { transport: euProvider },       // .eu, .de domains
    { transport: globalProvider },   // Everything else
  ],
});
~~~~

Custom strategies enable unlimited flexibility in routing logic, from simple
time-based rules to complex machine learning-driven provider selection.


Bulk email distribution
-----------------------

For applications that send newsletters, notifications, or other bulk emails,
the pool transport efficiently distributes large message volumes across
multiple providers while maintaining proper load balancing:

~~~~ typescript twoslash
import type { Transport } from "@upyo/core";
const provider1 = {} as Transport;
const provider2 = {} as Transport;
const provider3 = {} as Transport;
// ---cut-before---
import { PoolTransport } from "@upyo/pool";
import { createMessage } from "@upyo/core";

const pool = new PoolTransport({
  strategy: "weighted",
  transports: [
    { transport: provider1, weight: 3 }, // Gets ~50% of traffic
    { transport: provider2, weight: 2 }, // Gets ~33% of traffic
    { transport: provider3, weight: 1 }, // Gets ~17% of traffic
  ],
});

// Bulk newsletter sending
const subscribers = [
  "alice@example.com",
  "bob@example.com",
  "charlie@example.com",
  // ... thousands more
];

const newsletterMessages = subscribers.map(email =>
  createMessage({
    from: "newsletter@example.com",
    to: email,
    subject: "Monthly Newsletter - December 2024",
    content: {
      html: "<h2>This Month's Updates</h2><p>Here's what's new...</p>",
      text: "This Month's Updates\n\nHere's what's new...",
    },
    tags: ["newsletter", "monthly"],
  })
);

// Send all newsletters with automatic load balancing
const receipts: any[] = [];
let successCount = 0;
let failureCount = 0;

for await (const receipt of pool.sendMany(newsletterMessages)) {
  receipts.push(receipt);

  if (receipt.successful) {
    successCount++;
  } else {
    failureCount++;
    console.error(`Failed to send newsletter: ${receipt.errorMessages}`);
  }

  // Log progress every 100 messages
  if (receipts.length % 100 === 0) {
    console.log(`Processed ${receipts.length}/${newsletterMessages.length} newsletters`);
  }
}

console.log(`Newsletter campaign complete:`);
console.log(`  Successful: ${successCount}`);
console.log(`  Failed: ${failureCount}`);
console.log(`  Total: ${receipts.length}`);
~~~~

The pool automatically distributes bulk emails according to your configured
strategy, ensuring optimal load distribution and maximizing deliverability
across multiple providers.


Resource management
-------------------

The pool transport implements `AsyncDisposable` for automatic cleanup of
all underlying transports. This is especially important when using connection-
based transports like SMTP that maintain persistent connections:

~~~~ typescript twoslash
import { PoolTransport } from "@upyo/pool";
import type { Transport, Message } from "@upyo/core";
const transport1 = {} as Transport;
const transport2 = {} as Transport;
const message = {} as Message;
// ---cut-before---

// Automatic cleanup with 'using' statement
await using pool = new PoolTransport({
  strategy: "round-robin",
  transports: [
    { transport: transport1 },
    { transport: transport2 },
  ],
});

await pool.send(message);
// All underlying transports are disposed automatically when pool goes out of scope

// Or manual cleanup
const pool2 = new PoolTransport({
  strategy: "priority",
  transports: [
    { transport: transport1 },
    { transport: transport2 },
  ],
});

try {
  await pool2.send(message);
} finally {
  // Properly dispose all underlying transports
  await pool2[Symbol.asyncDispose]();
}
~~~~

The pool ensures that all underlying transports are properly cleaned up,
preventing connection leaks and ensuring graceful shutdown.


Testing with pools
------------------

Pool transports integrate seamlessly with testing workflows using mock
transports. You can verify load balancing behavior, test failover scenarios,
and ensure proper error handling:

~~~~ typescript twoslash
import { PoolTransport } from "@upyo/pool";
import { MockTransport } from "@upyo/mock";
import { createMessage } from "@upyo/core";
import assert from "node:assert/strict";

// Create mock transports for testing
const mockTransport1 = new MockTransport();
const mockTransport2 = new MockTransport();
const failingTransport = new MockTransport();

// Configure one transport to always fail
failingTransport.setNextResponse({
  successful: false,
  errorMessages: ["Simulated provider failure"],
});

const pool = new PoolTransport({
  strategy: "round-robin",
  transports: [
    { transport: mockTransport1 },
    { transport: mockTransport2 },
    { transport: failingTransport },
  ],
});

const testMessage = createMessage({
  from: "test@example.com",
  to: "user@example.com",
  subject: "Test Email",
  content: { text: "Testing pool behavior" },
});

// Test round-robin distribution
await pool.send(testMessage); // Should use mockTransport1
await pool.send(testMessage); // Should use mockTransport2
await pool.send(testMessage); // Should use failingTransport (will fail)
await pool.send(testMessage); // Should use mockTransport1 again

// Verify distribution
assert.equal(mockTransport1.getSentMessagesCount(), 2);
assert.equal(mockTransport2.getSentMessagesCount(), 1);
assert.equal(failingTransport.getSentMessagesCount(), 1);

// Test failover behavior
const poolWithFailover = new PoolTransport({
  strategy: "priority",
  transports: [
    { transport: failingTransport, priority: 100 },
    { transport: mockTransport1, priority: 50 },
  ],
  maxRetries: 2,
});

const receipt = await poolWithFailover.send(testMessage);

// Should succeed using mockTransport1 after failingTransport fails
assert.ok(receipt.successful);
assert.equal(mockTransport1.getSentMessagesCount(), 3); // One more message
~~~~

Mock transports provide complete visibility into pool behavior, making it
easy to verify that load balancing and failover work correctly.


Production deployment
---------------------

When deploying pool transports to production, consider these best practices
for optimal performance and reliability:

~~~~ typescript twoslash
import type { Transport } from "@upyo/core";
const primaryProvider = {} as Transport;
const secondaryProvider = {} as Transport;
const emergencyProvider = {} as Transport;
// ---cut-before---
import { PoolTransport } from "@upyo/pool";

// Production configuration with monitoring and fallbacks
const productionPool = new PoolTransport({
  strategy: "priority",
  transports: [
    {
      transport: primaryProvider,
      priority: 100,
      enabled: true, // Can be toggled via configuration
    },
    {
      transport: secondaryProvider,
      priority: 80,
      enabled: true,
    },
    {
      transport: emergencyProvider,
      priority: 10,
      enabled: true, // Emergency backup
    },
  ],
  maxRetries: 3,           // Allow fallback through all providers
  timeout: 15000,          // 15-second timeout per provider
});

// Add monitoring and logging
const originalSend = productionPool.send.bind(productionPool);
productionPool.send = async function(message, options) {
  const startTime = Date.now();

  try {
    const result = await originalSend(message, options);
    const duration = Date.now() - startTime;

    // Log successful sends
    console.log(`✅ Email sent successfully`, {
      messageId: result.successful ? result.messageId : 'failed',
      duration,
      recipient: message.recipients[0]?.address,
      subject: message.subject,
    });

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;

    // Log errors for monitoring
    console.error(`❌ Email send failed`, {
      error: String(error),
      duration,
      recipient: message.recipients[0]?.address,
      subject: message.subject,
    });

    throw error;
  }
};

// Graceful shutdown handling
process.on('SIGTERM', async () => {
  console.log('Shutting down email pool...');
  await productionPool[Symbol.asyncDispose]();
  console.log('Email pool shutdown complete');
});
~~~~

This configuration provides comprehensive error handling, monitoring, and
graceful shutdown capabilities suitable for production environments.


Use cases and patterns
----------------------

### High availability with geographic distribution

~~~~ typescript twoslash
import type { Transport } from "@upyo/core";
const usEastProvider = {} as Transport;
const usWestProvider = {} as Transport;
const euProvider = {} as Transport;
// ---cut-before---
import { PoolTransport } from "@upyo/pool";

const geoDistributedPool = new PoolTransport({
  strategy: "priority",
  transports: [
    { transport: usEastProvider, priority: 100 },   // Primary
    { transport: usWestProvider, priority: 90 },    // Regional backup
    { transport: euProvider, priority: 50 },        // Cross-region backup
  ],
  maxRetries: 3,
});
~~~~

### Cost optimization with tiered providers

~~~~ typescript twoslash
import type { Transport } from "@upyo/core";
const cheapProvider = {} as Transport;
const standardProvider = {} as Transport;
const premiumProvider = {} as Transport;
// ---cut-before---
import { PoolTransport } from "@upyo/pool";

const costOptimizedPool = new PoolTransport({
  strategy: "selector-based",
  transports: [
    {
      transport: cheapProvider,
      selector: (msg) => msg.tags?.includes("bulk") || msg.tags?.includes("newsletter"),
    },
    {
      transport: premiumProvider,
      selector: (msg) => msg.priority === "high" || msg.tags?.includes("transactional"),
    },
    {
      transport: standardProvider, // Default for everything else
    },
  ],
});
~~~~

### Gradual migration between providers

~~~~ typescript twoslash
import type { Transport } from "@upyo/core";
const oldProvider = {} as Transport;
const newProvider = {} as Transport;
// ---cut-before---
import { PoolTransport } from "@upyo/pool";

// Start with 90% old, 10% new traffic
const migrationPool = new PoolTransport({
  strategy: "weighted",
  transports: [
    { transport: oldProvider, weight: 90 },
    { transport: newProvider, weight: 10 },
  ],
});

// Gradually adjust weights over time:
// Week 1: 90/10
// Week 2: 70/30
// Week 3: 50/50
// Week 4: 20/80
// Week 5: 0/100 (migration complete)
~~~~

The pool transport provides the flexibility to implement sophisticated email
delivery strategies that adapt to your application's specific requirements
for reliability, cost, and performance.

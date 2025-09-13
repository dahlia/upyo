<!-- deno-fmt-ignore-file -->

@upyo/pool
==========

[![JSR][JSR badge]][JSR]
[![npm][npm badge]][npm]

Pool transport for the [Upyo] email library with load balancing and failover
strategies for combining multiple email providers.

[JSR]: https://jsr.io/@upyo/pool
[JSR badge]: https://jsr.io/badges/@upyo/pool
[npm]: https://www.npmjs.com/package/@upyo/pool
[npm badge]: https://img.shields.io/npm/v/@upyo/pool?logo=npm
[Upyo]: https://upyo.org/


Features
--------

 -  Multiple strategies: Round-robin, weighted, priority, and custom
    selector-based routing
 -  Automatic failover: Retry with different transports when one fails
 -  Load balancing: Distribute email traffic across multiple providers
 -  Drop-in replacement: Implements the same `Transport` interface
 -  Resource management: Proper cleanup with `AsyncDisposable` support
 -  Cross-runtime compatibility (Node.js, Deno, Bun, edge functions)
 -  TypeScript support


Installation
------------

~~~~ sh
npm  add       @upyo/core @upyo/pool
pnpm add       @upyo/core @upyo/pool
yarn add       @upyo/core @upyo/pool
deno add --jsr @upyo/core @upyo/pool
bun  add       @upyo/core @upyo/pool
~~~~


Usage
-----

### Round-robin load balancing

Distribute messages evenly across multiple transports in circular order:

~~~~ typescript
import { PoolTransport } from "@upyo/pool";
import { createSmtpTransport } from "@upyo/smtp";
import { createMailgunTransport } from "@upyo/mailgun";
import { createSendGridTransport } from "@upyo/sendgrid";

const transport = new PoolTransport({
  strategy: "round-robin",
  transports: [
    { transport: createSmtpTransport({ /* config */ }) },
    { transport: createMailgunTransport({ /* config */ }) },
    { transport: createSendGridTransport({ /* config */ }) },
  ],
});

// Messages are sent in order: SMTP → Mailgun → SendGrid → SMTP → ...
await transport.send(message1); // Uses SMTP
await transport.send(message2); // Uses Mailgun
await transport.send(message3); // Uses SendGrid
await transport.send(message4); // Uses SMTP again
~~~~

### Weighted distribution

Distribute traffic proportionally based on configured weights:

~~~~ typescript
const transport = new PoolTransport({
  strategy: "weighted",
  transports: [
    { transport: primaryTransport, weight: 3 },   // Gets ~60% of traffic
    { transport: secondaryTransport, weight: 2 }, // Gets ~40% of traffic
  ],
});
~~~~

### Priority-based failover

Always use the highest priority transport, falling back to lower priorities
only on failure:

~~~~ typescript
const transport = new PoolTransport({
  strategy: "priority",
  transports: [
    { transport: primaryTransport, priority: 100 },
    { transport: backupTransport, priority: 50 },
    { transport: emergencyTransport, priority: 10 },
  ],
  maxRetries: 3, // Try up to 3 transports
});

// Always tries primary first, only uses backup if primary fails
const receipt = await transport.send(message);
~~~~

### Custom routing with selectors

Route messages based on custom logic:

~~~~ typescript
const transport = new PoolTransport({
  strategy: "selector-based",
  transports: [
    {
      transport: bulkEmailTransport,
      selector: (msg) => msg.tags?.includes("newsletter"),
    },
    {
      transport: transactionalTransport,
      selector: (msg) => msg.priority === "high",
    },
    {
      transport: euTransport,
      selector: (msg) => msg.metadata?.region === "EU",
    },
    {
      transport: defaultTransport, // No selector - catches everything else
    },
  ],
});

// Newsletter goes through bulk provider
await transport.send({
  ...message,
  tags: ["newsletter", "marketing"],
});

// Important email goes through premium provider
await transport.send({
  ...message,
  priority: "high",
});
~~~~

### Custom strategies

You can implement custom routing strategies by creating a class that implements
the `Strategy` interface:

~~~~ typescript
import { PoolTransport, type Strategy, type TransportSelection } from "@upyo/pool";

class TimeBasedStrategy implements Strategy {
  select(message, transports, attemptedIndices) {
    const hour = new Date().getHours();

    // Use different transports based on time of day
    const preferredIndex = hour < 12 ? 0 : 1; // Morning vs afternoon

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

const transport = new PoolTransport({
  strategy: new TimeBasedStrategy(),
  transports: [
    { transport: morningTransport },
    { transport: afternoonTransport },
  ],
});
~~~~

### Resource management

The pool transport implements `AsyncDisposable` for automatic cleanup:

~~~~ typescript
// Automatic cleanup with 'using' statement
await using transport = new PoolTransport({
  strategy: "round-robin",
  transports: [/* ... */],
});

await transport.send(message);
// All underlying transports are disposed automatically

// Or manual cleanup
const transport = new PoolTransport(config);
try {
  await transport.send(message);
} finally {
  await transport[Symbol.asyncDispose]();
}
~~~~


Configuration
-------------

### `PoolConfig`

| Property            | Type                                                                    | Required | Default              | Description                                                       |
|---------------------|-------------------------------------------------------------------------|----------|----------------------|-------------------------------------------------------------------|
| `strategy`          | `"round-robin" | "weighted" | "priority" | "selector-based" | Strategy` | Yes      |                      | The strategy for selecting transports                             |
| `transports`        | `TransportEntry[]`                                                      | Yes      |                      | Array of transport configurations                                 |
| `maxRetries`        | `number`                                                                | No       | Number of transports | Maximum retry attempts on failure                                 |
| `timeout`           | `number`                                                                | No       |                      | Timeout in milliseconds for each send attempt                     |
| `continueOnSuccess` | `boolean`                                                               | No       | `false`              | Continue trying transports after success (selector strategy only) |

### `TransportEntry`

| Property    | Type                            | Required | Default | Description                                         |
|-------------|---------------------------------|----------|---------|-----------------------------------------------------|
| `transport` | `Transport`                     | Yes      |         | The transport instance                              |
| `weight`    | `number`                        | No       | `1`     | Weight for weighted distribution                    |
| `priority`  | `number`                        | No       | `0`     | Priority for priority strategy (higher = preferred) |
| `selector`  | `(message: Message) => boolean` | No       |         | Custom selector function                            |
| `enabled`   | `boolean`                       | No       | `true`  | Whether this transport is enabled                   |


Strategies
----------

### Round-robin

Cycles through transports in order, ensuring even distribution:

 -  Maintains internal counter
 -  Skips disabled transports
 -  Wraps around at the end of the list
 -  Best for: Even load distribution

### Weighted

Randomly selects transports based on configured weights:

 -  Higher weight = higher probability of selection
 -  Supports fractional weights
 -  Stateless random selection
 -  Best for: Proportional traffic distribution

### Priority

Always attempts highest priority transport first:

 -  Sorts by priority value (descending)
 -  Falls back to lower priorities on failure
 -  Random selection among same priority
 -  Best for: Primary/backup scenarios

### Selector-based

Routes messages based on custom logic:

 -  Evaluates selector functions in order
 -  Transports without selectors act as catch-all
 -  Falls back to default if no selector matches
 -  Best for: Content-based routing


Error handling
--------------

The pool transport aggregates errors from all failed attempts:

~~~~ typescript
const receipt = await transport.send(message);

if (!receipt.successful) {
  // Contains errors from all attempted transports
  console.error("Failed to send:", receipt.errorMessages);
}
~~~~


Testing
-------

Use `MockTransport` for testing pool behavior:

~~~~ typescript
import { PoolTransport } from "@upyo/pool";
import { MockTransport } from "@upyo/mock";

const mockTransport1 = new MockTransport();
const mockTransport2 = new MockTransport();

const pool = new PoolTransport({
  strategy: "round-robin",
  transports: [
    { transport: mockTransport1 },
    { transport: mockTransport2 },
  ],
});

await pool.send(message);

// Verify distribution
assert.equal(mockTransport1.getSentMessagesCount(), 1);
assert.equal(mockTransport2.getSentMessagesCount(), 0);
~~~~


Use cases
---------

### High availability

Ensure email delivery even when providers have outages:

~~~~ typescript
const transport = new PoolTransport({
  strategy: "priority",
  transports: [
    { transport: primaryProvider, priority: 100 },
    { transport: backupProvider1, priority: 50 },
    { transport: backupProvider2, priority: 50 },
  ],
});
~~~~

### Cost optimization

Route different types of emails through appropriate providers:

~~~~ typescript
const transport = new PoolTransport({
  strategy: "selector-based",
  transports: [
    {
      transport: cheapBulkProvider,
      selector: (msg) => msg.tags?.includes("newsletter"),
    },
    {
      transport: premiumProvider,
      selector: (msg) => msg.priority === "high" ||
                        msg.tags?.includes("transactional"),
    },
  ],
});
~~~~

### Rate limit management

Distribute load when approaching provider limits:

~~~~ typescript
const transport = new PoolTransport({
  strategy: "weighted",
  transports: [
    { transport: provider1, weight: 1 }, // 1000 emails/hour limit
    { transport: provider2, weight: 2 }, // 2000 emails/hour limit
  ],
});
~~~~

### Gradual migration

Shift traffic from old to new provider:

~~~~ typescript
const transport = new PoolTransport({
  strategy: "weighted",
  transports: [
    { transport: oldProvider, weight: 90 },  // Start with 90%
    { transport: newProvider, weight: 10 },  // Gradually increase
  ],
});
~~~~

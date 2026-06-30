import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { PoolTransport } from "./pool-transport.ts";
import { MockTransport } from "@upyo/mock";
import {
  createFailedReceipt,
  type Message,
  type Receipt,
  type Transport,
  type TransportOptions,
} from "@upyo/core";
import {
  createFailureTransport,
  createSuccessTransport,
  createTestMessage,
} from "./test-utils/test-config.ts";

describe("PoolTransport", () => {
  class FixedFailureTransport<TProviderId extends string>
    implements Transport<TProviderId> {
    readonly id: TProviderId;
    private readonly receipt: Receipt<TProviderId> & {
      readonly successful: false;
    };

    constructor(
      id: TProviderId,
      receipt: Receipt<TProviderId> & { readonly successful: false },
    ) {
      this.id = id;
      this.receipt = receipt;
    }

    send(
      _message: Message,
      _options?: TransportOptions,
    ): Promise<Receipt<TProviderId>> {
      return Promise.resolve(this.receipt);
    }

    async *sendMany(
      messages: Iterable<Message> | AsyncIterable<Message>,
      _options?: TransportOptions,
    ): AsyncIterable<Receipt<TProviderId>> {
      for await (const _message of messages) {
        yield this.receipt;
      }
    }
  }

  describe("round-robin strategy", () => {
    test("should distribute messages across transports", async () => {
      const transport1 = new MockTransport();
      const transport2 = new MockTransport();
      const transport3 = new MockTransport();

      const pool = new PoolTransport({
        strategy: "round-robin",
        transports: [
          { transport: transport1 },
          { transport: transport2 },
          { transport: transport3 },
        ],
      });

      // Send three messages
      await pool.send(createTestMessage({ subject: "Message 1" }));
      await pool.send(createTestMessage({ subject: "Message 2" }));
      await pool.send(createTestMessage({ subject: "Message 3" }));

      // Each transport should have received exactly one message
      assert.equal(transport1.getSentMessagesCount(), 1);
      assert.equal(transport2.getSentMessagesCount(), 1);
      assert.equal(transport3.getSentMessagesCount(), 1);

      // Verify the messages
      assert.equal(transport1.getSentMessages()[0].subject, "Message 1");
      assert.equal(transport2.getSentMessages()[0].subject, "Message 2");
      assert.equal(transport3.getSentMessages()[0].subject, "Message 3");
    });

    test("should skip disabled transports", async () => {
      const transport1 = new MockTransport();
      const transport2 = new MockTransport();
      const transport3 = new MockTransport();

      const pool = new PoolTransport({
        strategy: "round-robin",
        transports: [
          { transport: transport1, enabled: true },
          { transport: transport2, enabled: false },
          { transport: transport3, enabled: true },
        ],
      });

      await pool.send(createTestMessage({ subject: "Message 1" }));
      await pool.send(createTestMessage({ subject: "Message 2" }));

      assert.equal(transport1.getSentMessagesCount(), 1);
      assert.equal(transport2.getSentMessagesCount(), 0); // Disabled
      assert.equal(transport3.getSentMessagesCount(), 1);
    });
  });

  describe("weighted strategy", () => {
    test("should distribute based on weights", async () => {
      const transport1 = new MockTransport();
      const transport2 = new MockTransport();

      const pool = new PoolTransport({
        strategy: "weighted",
        transports: [
          { transport: transport1, weight: 1 },
          { transport: transport2, weight: 3 },
        ],
      });

      const originalRandom = Math.random;
      const randomValues = [0.125, 0.375, 0.625, 0.875];
      try {
        Math.random = () => randomValues.shift() ?? 0.875;

        for (let i = 0; i < 4; i++) {
          await pool.send(createTestMessage({ subject: `Message ${i}` }));
        }
      } finally {
        Math.random = originalRandom;
      }

      const count1 = transport1.getSentMessagesCount();
      const count2 = transport2.getSentMessagesCount();

      assert.equal(count1, 1);
      assert.equal(count2, 3);
    });
  });

  describe("priority strategy", () => {
    test("should use highest priority transport first", async () => {
      const highPriority = createSuccessTransport("high-id");
      const mediumPriority = createSuccessTransport("medium-id");
      const lowPriority = createSuccessTransport("low-id");

      const pool = new PoolTransport({
        strategy: "priority",
        transports: [
          { transport: lowPriority, priority: 10 },
          { transport: highPriority, priority: 100 },
          { transport: mediumPriority, priority: 50 },
        ],
      });

      const receipt = await pool.send(createTestMessage());
      assert.ok(receipt.successful);
      assert.equal(receipt.messageId, "high-id");

      // Only high priority should have been used
      assert.equal(highPriority.getSentMessagesCount(), 1);
      assert.equal(mediumPriority.getSentMessagesCount(), 0);
      assert.equal(lowPriority.getSentMessagesCount(), 0);
    });

    test("should failover to lower priority on failure", async () => {
      const highPriority = createFailureTransport("High priority failed");
      const mediumPriority = createSuccessTransport("medium-id");
      const lowPriority = createSuccessTransport("low-id");

      const pool = new PoolTransport({
        strategy: "priority",
        transports: [
          { transport: highPriority, priority: 100 },
          { transport: mediumPriority, priority: 50 },
          { transport: lowPriority, priority: 10 },
        ],
      });

      const receipt = await pool.send(createTestMessage());
      assert.ok(receipt.successful);
      assert.equal(receipt.messageId, "medium-id");

      // High priority was tried but failed
      assert.equal(highPriority.getSentMessagesCount(), 1);
      // Medium priority succeeded
      assert.equal(mediumPriority.getSentMessagesCount(), 1);
      // Low priority was not needed
      assert.equal(lowPriority.getSentMessagesCount(), 0);
    });
  });

  describe("selector-based strategy", () => {
    test("should route messages based on selectors", async () => {
      const newsletterTransport = new MockTransport();
      const transactionalTransport = new MockTransport();
      const defaultTransport = new MockTransport();

      const pool = new PoolTransport({
        strategy: "selector-based",
        transports: [
          {
            transport: newsletterTransport,
            selector: (msg) => msg.tags?.includes("newsletter"),
          },
          {
            transport: transactionalTransport,
            selector: (msg) => msg.priority === "high",
          },
          {
            transport: defaultTransport,
            // No selector - catches everything else
          },
        ],
      });

      // Send newsletter
      await pool.send(
        createTestMessage({
          subject: "Newsletter",
          tags: ["newsletter", "marketing"],
        }),
      );

      // Send transactional
      await pool.send(
        createTestMessage({
          subject: "Password Reset",
          priority: "high",
        }),
      );

      // Send default
      await pool.send(
        createTestMessage({
          subject: "Regular Email",
        }),
      );

      // Verify routing
      assert.equal(newsletterTransport.getSentMessagesCount(), 1);
      assert.equal(
        newsletterTransport.getSentMessages()[0].subject,
        "Newsletter",
      );

      assert.equal(transactionalTransport.getSentMessagesCount(), 1);
      assert.equal(
        transactionalTransport.getSentMessages()[0].subject,
        "Password Reset",
      );

      assert.equal(defaultTransport.getSentMessagesCount(), 1);
      assert.equal(
        defaultTransport.getSentMessages()[0].subject,
        "Regular Email",
      );
    });
  });

  describe("retry and failover", () => {
    test("should retry with different transports on failure", async () => {
      const transport1 = createFailureTransport("Failed 1");
      const transport2 = createFailureTransport("Failed 2");
      const transport3 = createSuccessTransport("success-id");

      const pool = new PoolTransport({
        strategy: "round-robin",
        transports: [
          { transport: transport1 },
          { transport: transport2 },
          { transport: transport3 },
        ],
        maxRetries: 3,
      });

      const receipt = await pool.send(createTestMessage());
      assert.ok(receipt.successful);
      assert.equal(receipt.messageId, "success-id");

      // All transports should have been tried
      assert.equal(transport1.getSentMessagesCount(), 1);
      assert.equal(transport2.getSentMessagesCount(), 1);
      assert.equal(transport3.getSentMessagesCount(), 1);
    });

    test("should return failure when all transports fail", async () => {
      const transport1 = createFailureTransport("Failed 1");
      const transport2 = createFailureTransport("Failed 2");

      const pool = new PoolTransport({
        strategy: "round-robin",
        transports: [
          { transport: transport1 },
          { transport: transport2 },
        ],
      });

      const receipt = await pool.send(createTestMessage());
      assert.ok(!receipt.successful);
      assert.ok(receipt.errorMessages.includes("Failed 1"));
      assert.ok(receipt.errorMessages.includes("Failed 2"));
    });

    test("should preserve transport ids in structured failures", async () => {
      const primary = new FixedFailureTransport(
        "mailgun",
        createFailedReceipt("Too many requests", {
          provider: "mailgun",
          statusCode: 429,
        }),
      );
      const secondary = new FixedFailureTransport<"sendgrid">("sendgrid", {
        successful: false,
        errorMessages: ["Invalid API key"],
      });

      const pool = new PoolTransport({
        strategy: "round-robin",
        transports: [
          { transport: primary },
          { transport: secondary },
        ],
      });

      const receipt = await pool.send(createTestMessage());

      assert.equal(receipt.successful, false);
      if (!receipt.successful) {
        assert.equal(receipt.provider, "pool");
        assert.equal(receipt.attempts, 2);
        assert.deepEqual(
          receipt.errors?.map((error) => error.provider),
          ["mailgun", "sendgrid"],
        );
        assert.equal(receipt.errors?.[0]?.category, "rate-limit");
        assert.equal(receipt.errors?.[1]?.category, "auth");
      }
    });

    test("should respect maxRetries limit", async () => {
      const transport1 = createFailureTransport("Failed");
      const transport2 = createFailureTransport("Failed");
      const transport3 = createSuccessTransport("success");

      const pool = new PoolTransport({
        strategy: "round-robin",
        transports: [
          { transport: transport1 },
          { transport: transport2 },
          { transport: transport3 },
        ],
        maxRetries: 2, // Only try 2 transports
      });

      const receipt = await pool.send(createTestMessage());
      assert.ok(!receipt.successful);

      // Only first two should have been tried
      assert.equal(transport1.getSentMessagesCount(), 1);
      assert.equal(transport2.getSentMessagesCount(), 1);
      assert.equal(transport3.getSentMessagesCount(), 0);
    });
  });

  describe("sendMany", () => {
    test("should send multiple messages", async () => {
      const transport = new MockTransport();
      const pool = new PoolTransport({
        strategy: "round-robin",
        transports: [{ transport }],
      });

      const messages = [
        createTestMessage({ subject: "Message 1" }),
        createTestMessage({ subject: "Message 2" }),
        createTestMessage({ subject: "Message 3" }),
      ];

      const receipts: Receipt[] = [];
      for await (const receipt of pool.sendMany(messages)) {
        receipts.push(receipt);
      }

      assert.equal(receipts.length, 3);
      assert.ok(receipts.every((r) => r.successful));
      assert.equal(transport.getSentMessagesCount(), 3);
    });

    test("should handle async iterable", async () => {
      const transport = new MockTransport();
      const pool = new PoolTransport({
        strategy: "round-robin",
        transports: [{ transport }],
      });

      async function* generateMessages() {
        yield createTestMessage({ subject: "Async 1" });
        yield createTestMessage({ subject: "Async 2" });
      }

      const receipts: Receipt[] = [];
      for await (const receipt of pool.sendMany(generateMessages())) {
        receipts.push(receipt);
      }

      assert.equal(receipts.length, 2);
      assert.ok(receipts.every((r) => r.successful));
    });
  });

  describe("abort signal", () => {
    test("should respect abort signal", async () => {
      const transport = new MockTransport({ delay: 100 });
      const pool = new PoolTransport({
        strategy: "round-robin",
        transports: [{ transport }],
      });

      const controller = new AbortController();
      setTimeout(() => controller.abort(), 10); // Abort after 10ms

      await assert.rejects(
        pool.send(createTestMessage(), { signal: controller.signal }),
        {
          name: "AbortError",
        },
      );
    });

    test("should abort sendMany on signal", async () => {
      const transport = new MockTransport({ delay: 100 });
      const pool = new PoolTransport({
        strategy: "round-robin",
        transports: [{ transport }],
      });

      const messages = [
        createTestMessage({ subject: "Message 1" }),
        createTestMessage({ subject: "Message 2" }),
      ];

      const controller = new AbortController();
      setTimeout(() => controller.abort(), 50);

      await assert.rejects(
        async () => {
          const receipts: Receipt[] = [];
          for await (
            const receipt of pool.sendMany(messages, {
              signal: controller.signal,
            })
          ) {
            receipts.push(receipt);
          }
        },
        {
          name: "AbortError",
        },
      );
    });
  });

  describe("AsyncDisposable", () => {
    test("should dispose underlying transports", async () => {
      let disposed1 = false;
      let disposed2 = false;

      const transport1 = new MockTransport();
      const transport2 = new MockTransport();

      // Add disposal tracking
      (transport1 as unknown as AsyncDisposable)[Symbol.asyncDispose] = () => {
        disposed1 = true;
        return Promise.resolve();
      };
      (transport2 as unknown as Disposable)[Symbol.dispose] = () => {
        disposed2 = true;
      };

      const pool = new PoolTransport({
        strategy: "round-robin",
        transports: [{ transport: transport1 }, { transport: transport2 }],
      });

      await pool[Symbol.asyncDispose]();

      assert.ok(disposed1);
      assert.ok(disposed2);
    });
  });

  describe("custom strategy", () => {
    test("should accept custom strategy instance", async () => {
      const transport1 = new MockTransport();
      const transport2 = new MockTransport();

      // Custom strategy that always selects the second transport
      const customStrategy = {
        select: () => ({
          entry: {
            transport: transport2,
            weight: 1,
            priority: 0,
            enabled: true,
          },
          index: 1,
        }),
        reset: () => {},
      };

      const pool = new PoolTransport({
        strategy: customStrategy,
        transports: [
          { transport: transport1 },
          { transport: transport2 },
        ],
      });

      await pool.send(createTestMessage());
      await pool.send(createTestMessage());

      // Custom strategy should always use transport2
      assert.equal(transport1.getSentMessagesCount(), 0);
      assert.equal(transport2.getSentMessagesCount(), 2);
    });
  });

  describe("configuration validation", () => {
    test("should throw on empty transports", () => {
      assert.throws(
        () => {
          new PoolTransport({
            strategy: "round-robin",
            transports: [],
          });
        },
        {
          message: /at least one transport/,
        },
      );
    });

    test("should throw on all disabled transports", () => {
      assert.throws(
        () => {
          new PoolTransport({
            strategy: "round-robin",
            transports: [
              { transport: new MockTransport(), enabled: false },
              { transport: new MockTransport(), enabled: false },
            ],
          });
        },
        {
          message: /at least one enabled transport/,
        },
      );
    });

    test("should throw on invalid strategy", () => {
      assert.throws(
        () => {
          new PoolTransport({
            strategy: "invalid" as "round-robin",
            transports: [{ transport: new MockTransport() }],
          });
        },
        {
          message: /Unknown strategy/,
        },
      );
    });
  });
});

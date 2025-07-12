import type { Receipt } from "@upyo/core";
import { MockTransport } from "@upyo/mock";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  createTestMessage,
  createTestMockTransport,
} from "./test-utils/test-config.ts";
import {
  validateAllSuccessful,
  validateFailedReceipt,
  validateSuccessfulReceipt,
} from "./test-utils/mock-validation-utils.ts";

describe("MockTransport", () => {
  test("should send a single message successfully", async () => {
    const transport = createTestMockTransport();
    const message = createTestMessage();

    const receipt = await transport.send(message);

    validateSuccessfulReceipt(receipt);
    assert.equal(transport.getSentMessagesCount(), 1);
    assert.equal(transport.getLastSentMessage(), message);
  });

  test("should generate unique message IDs", async () => {
    const transport = createTestMockTransport();
    const message1 = createTestMessage({ subject: "First" });
    const message2 = createTestMessage({ subject: "Second" });

    const receipt1 = await transport.send(message1);
    const receipt2 = await transport.send(message2);

    validateSuccessfulReceipt(receipt1);
    validateSuccessfulReceipt(receipt2);
    assert.notEqual(receipt1.messageId, receipt2.messageId);
  });

  test("should store messages in order", async () => {
    const transport = createTestMockTransport();
    const messages = [
      createTestMessage({ subject: "First" }),
      createTestMessage({ subject: "Second" }),
      createTestMessage({ subject: "Third" }),
    ];

    for (const message of messages) {
      await transport.send(message);
    }

    const sentMessages = transport.getSentMessages();
    assert.equal(sentMessages.length, 3);
    assert.equal(sentMessages[0].subject, "First");
    assert.equal(sentMessages[1].subject, "Second");
    assert.equal(sentMessages[2].subject, "Third");
  });

  test("should handle sendMany with iterable", async () => {
    const transport = createTestMockTransport();
    const messages = [
      createTestMessage({ subject: "Batch 1" }),
      createTestMessage({ subject: "Batch 2" }),
    ];

    const receipts: Receipt[] = [];
    for await (const receipt of transport.sendMany(messages)) {
      receipts.push(receipt);
    }

    assert.equal(receipts.length, 2);
    validateAllSuccessful(receipts);
    assert.equal(transport.getSentMessagesCount(), 2);
  });

  test("should handle sendMany with async iterable", async () => {
    const transport = createTestMockTransport();

    async function* generateMessages() {
      yield createTestMessage({ subject: "Async 1" });
      yield createTestMessage({ subject: "Async 2" });
    }

    const receipts: Receipt[] = [];
    for await (const receipt of transport.sendMany(generateMessages())) {
      receipts.push(receipt);
    }

    assert.equal(receipts.length, 2);
    validateAllSuccessful(receipts);
  });

  test("should support custom default response", async () => {
    const customResponse = {
      successful: true as const,
      messageId: "custom-id",
    };
    const transport = new MockTransport({
      defaultResponse: customResponse,
      generateUniqueMessageIds: false,
    });

    const message = createTestMessage();
    const receipt = await transport.send(message);

    validateSuccessfulReceipt(receipt);
    assert.equal(receipt.messageId, "custom-id");
  });

  test("should support next response override", async () => {
    const transport = createTestMockTransport();
    const customResponse = {
      successful: false as const,
      errorMessages: ["Custom error"],
    };

    transport.setNextResponse(customResponse);

    const receipt = await transport.send(createTestMessage());
    validateFailedReceipt(receipt);
    assert.deepEqual(receipt.errorMessages, ["Custom error"]);

    // Next send should use default response
    const receipt2 = await transport.send(createTestMessage());
    validateSuccessfulReceipt(receipt2);
  });

  test("should simulate failure rate", async () => {
    const transport = new MockTransport({
      failureRate: 1.0, // 100% failure rate
    });

    const receipt = await transport.send(createTestMessage());
    validateFailedReceipt(receipt);
    assert.ok(receipt.errorMessages.includes("Simulated random failure"));
  });

  test("should apply fixed delay", async () => {
    const transport = new MockTransport({
      delay: 100,
    });

    const startTime = Date.now();
    await transport.send(createTestMessage());
    const elapsed = Date.now() - startTime;

    assert.ok(elapsed >= 90); // Allow some tolerance
  });

  test("should apply random delay", async () => {
    const transport = new MockTransport({
      randomDelayRange: { min: 50, max: 100 },
    });

    const startTime = Date.now();
    await transport.send(createTestMessage());
    const elapsed = Date.now() - startTime;

    assert.ok(elapsed >= 40); // Allow some tolerance
  });

  test("should support AbortSignal", async () => {
    const transport = createTestMockTransport();
    const controller = new AbortController();

    controller.abort();

    try {
      await transport.send(createTestMessage(), { signal: controller.signal });
      assert.fail("Should have thrown AbortError");
    } catch (error: unknown) {
      assert.ok(error instanceof Error);
      assert.equal(error.name, "AbortError");
    }
  });

  test("should support message filtering", async () => {
    const transport = createTestMockTransport();

    await transport.send(createTestMessage({
      to: "user1@example.com",
      subject: "Hello User 1",
    }));
    await transport.send(createTestMessage({
      to: "user2@example.com",
      subject: "Hello User 2",
    }));
    await transport.send(createTestMessage({
      to: "user1@example.com",
      subject: "Another for User 1",
    }));

    const user1Messages = transport.getMessagesTo("user1@example.com");
    assert.equal(user1Messages.length, 2);

    const helloMessages = transport.getMessagesBySubject("Hello User 1");
    assert.equal(helloMessages.length, 1);

    const foundMessage = transport.findMessageBy((m) =>
      m.subject.includes("Another")
    );
    assert.ok(foundMessage);
    assert.equal(foundMessage.subject, "Another for User 1");
  });

  test("should support waiting for messages", async () => {
    const transport = createTestMockTransport();

    // Start waiting for messages
    const waitPromise = transport.waitForMessageCount(2, 1000);

    // Send messages with small delays
    setTimeout(
      () => transport.send(createTestMessage({ subject: "First" })),
      10,
    );
    setTimeout(
      () => transport.send(createTestMessage({ subject: "Second" })),
      20,
    );

    await waitPromise; // Should resolve when 2 messages are sent
    assert.equal(transport.getSentMessagesCount(), 2);
  });

  test("should support waiting for specific message", async () => {
    const transport = createTestMockTransport();

    // Start waiting for a specific message
    const waitPromise = transport.waitForMessage(
      (m) => m.subject === "Target Message",
      1000,
    );

    // Send various messages
    setTimeout(
      () => transport.send(createTestMessage({ subject: "Other Message" })),
      10,
    );
    setTimeout(
      () => transport.send(createTestMessage({ subject: "Target Message" })),
      20,
    );

    const foundMessage = await waitPromise;
    assert.equal(foundMessage.subject, "Target Message");
  });

  test("should reset to initial state", async () => {
    const transport = createTestMockTransport();

    // Send some messages and configure behavior
    await transport.send(createTestMessage());
    transport.setDelay(100);
    transport.setFailureRate(0.5);
    transport.setNextResponse({ successful: false, errorMessages: ["Error"] });

    assert.equal(transport.getSentMessagesCount(), 1);

    // Reset
    transport.reset();

    assert.equal(transport.getSentMessagesCount(), 0);
    assert.equal(transport.getLastSentMessage(), undefined);

    // Should use default behavior after reset
    const receipt = await transport.send(createTestMessage());
    validateSuccessfulReceipt(receipt);
  });

  test("should clear sent messages", async () => {
    const transport = createTestMockTransport();

    await transport.send(createTestMessage());
    await transport.send(createTestMessage());

    assert.equal(transport.getSentMessagesCount(), 2);

    transport.clearSentMessages();

    assert.equal(transport.getSentMessagesCount(), 0);
    assert.equal(transport.getLastSentMessage(), undefined);
  });
});

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { SelectorStrategy } from "./selector-strategy.ts";
import type { ResolvedTransportEntry } from "../config.ts";
import { createTestMessage } from "../test-utils/test-config.ts";
import { MockTransport } from "@upyo/mock";
import type { Message } from "@upyo/core";

describe("SelectorStrategy", () => {
  function createTestEntries(): ResolvedTransportEntry[] {
    return [
      {
        transport: new MockTransport(),
        weight: 1,
        priority: 0,
        enabled: true,
        selector: (msg: Message) => msg.tags?.includes("newsletter"),
      },
      {
        transport: new MockTransport(),
        weight: 1,
        priority: 0,
        enabled: true,
        selector: (msg: Message) => msg.priority === "high",
      },
      {
        transport: new MockTransport(),
        weight: 1,
        priority: 0,
        enabled: true,
        // No selector - accepts all
      },
      {
        transport: new MockTransport(),
        weight: 1,
        priority: 0,
        enabled: false,
        selector: (msg: Message) => msg.tags?.includes("promo"),
      },
    ];
  }

  test("should select transport with matching selector", () => {
    const strategy = new SelectorStrategy();
    const transports = createTestEntries();
    const message = createTestMessage({ tags: ["newsletter", "marketing"] });
    const attemptedIndices = new Set<number>();

    const selection = strategy.select(message, transports, attemptedIndices);
    assert.ok(selection);
    assert.equal(selection.index, 0);
  });

  test("should select transport without selector as fallback", () => {
    const strategy = new SelectorStrategy();
    const transports = createTestEntries();
    const message = createTestMessage({ tags: ["transactional"] });
    const attemptedIndices = new Set<number>();

    // No selector matches, should select transport without selector (index 2)
    const selection = strategy.select(message, transports, attemptedIndices);
    assert.ok(selection);
    assert.equal(selection.index, 2);
  });

  test("should randomly select among multiple matching transports", () => {
    const strategy = new SelectorStrategy();
    const transports: ResolvedTransportEntry[] = [
      {
        transport: new MockTransport(),
        weight: 1,
        priority: 0,
        enabled: true,
        selector: (msg: Message) => msg.tags?.includes("test"),
      },
      {
        transport: new MockTransport(),
        weight: 1,
        priority: 0,
        enabled: true,
        selector: (msg: Message) => msg.tags?.includes("test"),
      },
    ];
    const message = createTestMessage({ tags: ["test"] });
    const attemptedIndices = new Set<number>();

    // Count selections over many iterations
    const selectionCounts = new Map<number, number>();
    const iterations = 100;

    for (let i = 0; i < iterations; i++) {
      const selection = strategy.select(message, transports, attemptedIndices);
      if (selection) {
        selectionCounts.set(
          selection.index,
          (selectionCounts.get(selection.index) || 0) + 1,
        );
      }
    }

    // Both should be selected at least once
    assert.ok((selectionCounts.get(0) || 0) > 0);
    assert.ok((selectionCounts.get(1) || 0) > 0);
  });

  test("should skip disabled transports even if selector matches", () => {
    const strategy = new SelectorStrategy();
    const transports = createTestEntries();
    const message = createTestMessage({ tags: ["promo"] });
    const attemptedIndices = new Set<number>();

    // Index 3 has matching selector but is disabled
    // Should fall back to transport without selector (index 2)
    const selection = strategy.select(message, transports, attemptedIndices);
    assert.ok(selection);
    assert.equal(selection.index, 2);
  });

  test("should skip already attempted transports", () => {
    const strategy = new SelectorStrategy();
    const transports = createTestEntries();
    const message = createTestMessage({ tags: ["newsletter"] });
    const attemptedIndices = new Set([0]); // Already tried matching transport

    // Should fall back to transport without selector
    const selection = strategy.select(message, transports, attemptedIndices);
    assert.ok(selection);
    assert.equal(selection.index, 2);
  });

  test("should handle selector that throws error", () => {
    const strategy = new SelectorStrategy();
    const transports: ResolvedTransportEntry[] = [
      {
        transport: new MockTransport(),
        weight: 1,
        priority: 0,
        enabled: true,
        selector: (_msg: Message) => {
          throw new Error("Selector error");
        },
      },
      {
        transport: new MockTransport(),
        weight: 1,
        priority: 0,
        enabled: true,
        // No selector
      },
    ];
    const message = createTestMessage();
    const attemptedIndices = new Set<number>();

    // Should skip transport with throwing selector and select fallback
    const selection = strategy.select(message, transports, attemptedIndices);
    assert.ok(selection);
    assert.equal(selection.index, 1);
  });

  test("should return undefined when no transport matches or available", () => {
    const strategy = new SelectorStrategy();
    const transports: ResolvedTransportEntry[] = [
      {
        transport: new MockTransport(),
        weight: 1,
        priority: 0,
        enabled: true,
        selector: (msg: Message) => msg.tags?.includes("newsletter"),
      },
      {
        transport: new MockTransport(),
        weight: 1,
        priority: 0,
        enabled: true,
        selector: (msg: Message) => msg.priority === "high",
      },
    ];
    const message = createTestMessage({ tags: ["other"] });
    const attemptedIndices = new Set<number>();

    // No selector matches and no fallback available
    const selection = strategy.select(message, transports, attemptedIndices);
    assert.equal(selection, undefined);
  });

  test("should prioritize selector matches over fallbacks", () => {
    const strategy = new SelectorStrategy();
    const transports: ResolvedTransportEntry[] = [
      {
        transport: new MockTransport(),
        weight: 1,
        priority: 0,
        enabled: true,
        // No selector - fallback
      },
      {
        transport: new MockTransport(),
        weight: 1,
        priority: 0,
        enabled: true,
        selector: (msg: Message) => msg.priority === "high",
      },
    ];
    const message = createTestMessage({ priority: "high" });
    const attemptedIndices = new Set<number>();

    // Should select transport with matching selector (index 1) over fallback
    const selection = strategy.select(message, transports, attemptedIndices);
    assert.ok(selection);
    assert.equal(selection.index, 1);
  });

  test("reset() should be a no-op", () => {
    const strategy = new SelectorStrategy();
    const transports = createTestEntries();
    const message = createTestMessage({ tags: ["newsletter"] });
    const attemptedIndices = new Set<number>();

    // Select before reset
    const selection1 = strategy.select(message, transports, attemptedIndices);
    assert.ok(selection1);

    // Reset should not affect stateless strategy
    strategy.reset();

    // Should still select matching transport
    const selection2 = strategy.select(message, transports, attemptedIndices);
    assert.ok(selection2);
    assert.equal(selection2.index, 0);
  });
});

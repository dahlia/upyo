import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { RoundRobinStrategy } from "./round-robin-strategy.ts";
import type { ResolvedTransportEntry } from "../config.ts";
import { createTestMessage } from "../test-utils/test-config.ts";
import { MockTransport } from "@upyo/mock";

describe("RoundRobinStrategy", () => {
  function createTestEntries(): ResolvedTransportEntry[] {
    return [
      {
        transport: new MockTransport(),
        weight: 1,
        priority: 0,
        enabled: true,
      },
      {
        transport: new MockTransport(),
        weight: 1,
        priority: 0,
        enabled: true,
      },
      {
        transport: new MockTransport(),
        weight: 1,
        priority: 0,
        enabled: false, // Disabled
      },
      {
        transport: new MockTransport(),
        weight: 1,
        priority: 0,
        enabled: true,
      },
    ];
  }

  test("should cycle through enabled transports in order", () => {
    const strategy = new RoundRobinStrategy();
    const transports = createTestEntries();
    const message = createTestMessage();
    const attemptedIndices = new Set<number>();

    // First selection should be index 0
    const selection1 = strategy.select(message, transports, attemptedIndices);
    assert.equal(selection1?.index, 0);

    // Second selection should be index 1
    const selection2 = strategy.select(message, transports, attemptedIndices);
    assert.equal(selection2?.index, 1);

    // Third selection should skip index 2 (disabled) and select index 3
    const selection3 = strategy.select(message, transports, attemptedIndices);
    assert.equal(selection3?.index, 3);

    // Fourth selection should wrap around to index 0
    const selection4 = strategy.select(message, transports, attemptedIndices);
    assert.equal(selection4?.index, 0);
  });

  test("should skip already attempted transports", () => {
    const strategy = new RoundRobinStrategy();
    const transports = createTestEntries();
    const message = createTestMessage();
    const attemptedIndices = new Set([0, 1]); // Already tried 0 and 1

    // Should skip 0, 1, and disabled 2, select 3
    const selection1 = strategy.select(message, transports, attemptedIndices);
    assert.equal(selection1?.index, 3);

    attemptedIndices.add(3);

    // All enabled transports attempted, should return undefined
    const selection2 = strategy.select(message, transports, attemptedIndices);
    assert.equal(selection2, undefined);
  });

  test("should return undefined when no enabled transports", () => {
    const strategy = new RoundRobinStrategy();
    const transports: ResolvedTransportEntry[] = [
      {
        transport: new MockTransport(),
        weight: 1,
        priority: 0,
        enabled: false,
      },
      {
        transport: new MockTransport(),
        weight: 1,
        priority: 0,
        enabled: false,
      },
    ];
    const message = createTestMessage();
    const attemptedIndices = new Set<number>();

    const selection = strategy.select(message, transports, attemptedIndices);
    assert.equal(selection, undefined);
  });

  test("should reset counter on reset()", () => {
    const strategy = new RoundRobinStrategy();
    const transports = createTestEntries();
    const message = createTestMessage();
    const attemptedIndices = new Set<number>();

    // Advance to second transport
    strategy.select(message, transports, attemptedIndices);
    const selection1 = strategy.select(message, transports, attemptedIndices);
    assert.equal(selection1?.index, 1);

    // Reset and verify it starts from beginning
    strategy.reset();
    const selection2 = strategy.select(message, transports, attemptedIndices);
    assert.equal(selection2?.index, 0);
  });

  test("should handle single enabled transport", () => {
    const strategy = new RoundRobinStrategy();
    const transports: ResolvedTransportEntry[] = [
      {
        transport: new MockTransport(),
        weight: 1,
        priority: 0,
        enabled: true,
      },
    ];
    const message = createTestMessage();
    const attemptedIndices = new Set<number>();

    // Should always select the only transport
    const selection1 = strategy.select(message, transports, attemptedIndices);
    assert.equal(selection1?.index, 0);

    const selection2 = strategy.select(message, transports, attemptedIndices);
    assert.equal(selection2?.index, 0);
  });
});

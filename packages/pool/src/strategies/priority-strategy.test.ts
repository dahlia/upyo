import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { PriorityStrategy } from "./priority-strategy.ts";
import type { ResolvedTransportEntry } from "../config.ts";
import { createTestMessage } from "../test-utils/test-config.ts";
import { MockTransport } from "@upyo/mock";

describe("PriorityStrategy", () => {
  function createTestEntries(): ResolvedTransportEntry[] {
    return [
      {
        transport: new MockTransport(),
        weight: 1,
        priority: 10, // Low priority
        enabled: true,
      },
      {
        transport: new MockTransport(),
        weight: 1,
        priority: 100, // High priority
        enabled: true,
      },
      {
        transport: new MockTransport(),
        weight: 1,
        priority: 50, // Medium priority
        enabled: true,
      },
      {
        transport: new MockTransport(),
        weight: 1,
        priority: 100, // Also high priority
        enabled: true,
      },
      {
        transport: new MockTransport(),
        weight: 1,
        priority: 200, // Highest but disabled
        enabled: false,
      },
    ];
  }

  test("should select highest priority transport first", () => {
    const strategy = new PriorityStrategy();
    const transports = createTestEntries();
    const message = createTestMessage();
    const attemptedIndices = new Set<number>();

    // Should select one of the transports with priority 100 (indices 1 or 3)
    const selection = strategy.select(message, transports, attemptedIndices);
    assert.ok(selection);
    assert.ok(selection.index === 1 || selection.index === 3);
    assert.equal(selection.entry.priority, 100);
  });

  test("should randomly select among same priority transports", () => {
    const strategy = new PriorityStrategy();
    const transports = createTestEntries();
    const message = createTestMessage();
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

    // Both indices 1 and 3 (priority 100) should be selected
    const count1 = selectionCounts.get(1) || 0;
    const count3 = selectionCounts.get(3) || 0;

    assert.ok(count1 > 0);
    assert.ok(count3 > 0);
    assert.equal(count1 + count3, iterations);

    // Other priorities should not be selected
    assert.equal(selectionCounts.get(0) || 0, 0);
    assert.equal(selectionCounts.get(2) || 0, 0);
    assert.equal(selectionCounts.get(4) || 0, 0);
  });

  test("should fall back to lower priority when higher ones attempted", () => {
    const strategy = new PriorityStrategy();
    const transports = createTestEntries();
    const message = createTestMessage();
    const attemptedIndices = new Set([1, 3]); // Already tried priority 100

    // Should select priority 50 (index 2)
    const selection = strategy.select(message, transports, attemptedIndices);
    assert.ok(selection);
    assert.equal(selection.index, 2);
    assert.equal(selection.entry.priority, 50);
  });

  test("should skip disabled transports", () => {
    const strategy = new PriorityStrategy();
    const transports = createTestEntries();
    const message = createTestMessage();
    const attemptedIndices = new Set<number>();

    // Transport at index 4 has priority 200 but is disabled
    // Should select priority 100 instead
    const selection = strategy.select(message, transports, attemptedIndices);
    assert.ok(selection);
    assert.ok(selection.index === 1 || selection.index === 3);
    assert.equal(selection.entry.priority, 100);
  });

  test("should return undefined when all transports attempted", () => {
    const strategy = new PriorityStrategy();
    const transports = createTestEntries();
    const message = createTestMessage();
    const attemptedIndices = new Set([0, 1, 2, 3, 4]);

    const selection = strategy.select(message, transports, attemptedIndices);
    assert.equal(selection, undefined);
  });

  test("should handle negative priorities", () => {
    const strategy = new PriorityStrategy();
    const transports: ResolvedTransportEntry[] = [
      {
        transport: new MockTransport(),
        weight: 1,
        priority: -10,
        enabled: true,
      },
      {
        transport: new MockTransport(),
        weight: 1,
        priority: -5,
        enabled: true,
      },
    ];
    const message = createTestMessage();
    const attemptedIndices = new Set<number>();

    // Should select -5 (higher than -10)
    const selection = strategy.select(message, transports, attemptedIndices);
    assert.ok(selection);
    assert.equal(selection.index, 1);
    assert.equal(selection.entry.priority, -5);
  });

  test("reset() should be a no-op", () => {
    const strategy = new PriorityStrategy();
    const transports = createTestEntries();
    const message = createTestMessage();
    const attemptedIndices = new Set<number>();

    // Select before reset
    const selection1 = strategy.select(message, transports, attemptedIndices);
    assert.ok(selection1);

    // Reset should not affect stateless strategy
    strategy.reset();

    // Should still select highest priority
    const selection2 = strategy.select(message, transports, attemptedIndices);
    assert.ok(selection2);
    assert.equal(selection2.entry.priority, 100);
  });
});

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { WeightedStrategy } from "./weighted-strategy.ts";
import type { ResolvedTransportEntry } from "../config.ts";
import { createTestMessage } from "../test-utils/test-config.ts";
import { MockTransport } from "@upyo/mock";

describe("WeightedStrategy", () => {
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
        weight: 2,
        priority: 0,
        enabled: true,
      },
      {
        transport: new MockTransport(),
        weight: 3,
        priority: 0,
        enabled: true,
      },
      {
        transport: new MockTransport(),
        weight: 1,
        priority: 0,
        enabled: false, // Disabled
      },
    ];
  }

  test("should select transports based on weight distribution", () => {
    const strategy = new WeightedStrategy();
    const transports = createTestEntries();
    const message = createTestMessage();
    const attemptedIndices = new Set<number>();

    // Count selections over many iterations
    const selectionCounts = new Map<number, number>();
    const iterations = 1000;

    for (let i = 0; i < iterations; i++) {
      const selection = strategy.select(message, transports, attemptedIndices);
      if (selection) {
        selectionCounts.set(
          selection.index,
          (selectionCounts.get(selection.index) || 0) + 1,
        );
      }
    }

    // Verify distribution roughly matches weights
    // Transport 0: weight 1 (1/6 ≈ 16.7%)
    // Transport 1: weight 2 (2/6 ≈ 33.3%)
    // Transport 2: weight 3 (3/6 = 50%)
    // Transport 3: disabled (0%)

    const count0 = selectionCounts.get(0) || 0;
    const count1 = selectionCounts.get(1) || 0;
    const count2 = selectionCounts.get(2) || 0;
    const count3 = selectionCounts.get(3) || 0;

    // Allow 10% variance
    assert.ok(count0 > iterations * 0.07 && count0 < iterations * 0.27);
    assert.ok(count1 > iterations * 0.23 && count1 < iterations * 0.43);
    assert.ok(count2 > iterations * 0.40 && count2 < iterations * 0.60);
    assert.equal(count3, 0); // Disabled transport should never be selected
  });

  test("should skip already attempted transports", () => {
    const strategy = new WeightedStrategy();
    const transports = createTestEntries();
    const message = createTestMessage();
    const attemptedIndices = new Set([0, 1]); // Already tried 0 and 1

    // Should only select from index 2 (weight 3)
    const selections = new Set<number>();
    for (let i = 0; i < 10; i++) {
      const selection = strategy.select(message, transports, attemptedIndices);
      if (selection) {
        selections.add(selection.index);
      }
    }

    assert.equal(selections.size, 1);
    assert.ok(selections.has(2));
  });

  test("should return undefined when all transports attempted", () => {
    const strategy = new WeightedStrategy();
    const transports = createTestEntries();
    const message = createTestMessage();
    const attemptedIndices = new Set([0, 1, 2, 3]);

    const selection = strategy.select(message, transports, attemptedIndices);
    assert.equal(selection, undefined);
  });

  test("should return undefined when no enabled transports", () => {
    const strategy = new WeightedStrategy();
    const transports: ResolvedTransportEntry[] = [
      {
        transport: new MockTransport(),
        weight: 1,
        priority: 0,
        enabled: false,
      },
      {
        transport: new MockTransport(),
        weight: 2,
        priority: 0,
        enabled: false,
      },
    ];
    const message = createTestMessage();
    const attemptedIndices = new Set<number>();

    const selection = strategy.select(message, transports, attemptedIndices);
    assert.equal(selection, undefined);
  });

  test("should handle zero weight transports", () => {
    const strategy = new WeightedStrategy();
    const transports: ResolvedTransportEntry[] = [
      {
        transport: new MockTransport(),
        weight: 0, // Zero weight
        priority: 0,
        enabled: true,
      },
      {
        transport: new MockTransport(),
        weight: 1,
        priority: 0,
        enabled: true,
      },
    ];
    const message = createTestMessage();
    const attemptedIndices = new Set<number>();

    // Should only select transport with positive weight
    const selections = new Set<number>();
    for (let i = 0; i < 10; i++) {
      const selection = strategy.select(message, transports, attemptedIndices);
      if (selection) {
        selections.add(selection.index);
      }
    }

    assert.equal(selections.size, 1);
    assert.ok(selections.has(1));
  });

  test("reset() should be a no-op", () => {
    const strategy = new WeightedStrategy();
    const transports = createTestEntries();
    const message = createTestMessage();
    const attemptedIndices = new Set<number>();

    // Select before reset
    const selection1 = strategy.select(message, transports, attemptedIndices);
    assert.ok(selection1);

    // Reset should not affect stateless strategy
    strategy.reset();

    // Should still be able to select
    const selection2 = strategy.select(message, transports, attemptedIndices);
    assert.ok(selection2);
  });
});

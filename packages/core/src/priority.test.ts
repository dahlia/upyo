import { comparePriority, type Priority } from "@upyo/core/priority";
import assert from "node:assert/strict";
import { test } from "node:test";

test("comparePriority()", () => {
  const priorities: Priority[] = ["normal", "low", "high"];
  priorities.sort(comparePriority);
  assert.deepStrictEqual(priorities, ["high", "normal", "low"]);

  // Test individual comparisons
  assert.strictEqual(comparePriority("high", "normal"), -1);
  assert.strictEqual(comparePriority("normal", "high"), 1);
  assert.strictEqual(comparePriority("low", "normal"), 1);
  assert.strictEqual(comparePriority("normal", "low"), -1);
  assert.strictEqual(comparePriority("high", "low"), -1);
  assert.strictEqual(comparePriority("low", "high"), 1);
});

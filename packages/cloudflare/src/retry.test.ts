import { backoffMilliseconds } from "./retry.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("backoffMilliseconds", () => {
  it("waits 1 second, doubling after each attempt, at most 10 seconds", () => {
    assert.deepEqual(
      [1, 2, 3, 4, 5, 6].map(backoffMilliseconds),
      [1000, 2000, 4000, 8000, 10000, 10000],
    );
  });
});

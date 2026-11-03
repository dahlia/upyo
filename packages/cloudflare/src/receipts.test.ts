import { CloudflareValidationError } from "./errors.ts";
import { createValidationFailure } from "./receipts.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("createValidationFailure", () => {
  it("keeps the code of a CloudflareValidationError", () => {
    const receipt = createValidationFailure(
      new CloudflareValidationError(
        "Too many recipients.",
        "cloudflare.too_many_recipients",
      ),
    );
    assert.ok(receipt != null);
    assert.deepEqual(receipt.errorMessages, ["Too many recipients."]);
    assert.equal(receipt.errors?.[0].code, "cloudflare.too_many_recipients");
    assert.equal(receipt.errors?.[0].category, "validation");
    assert.ok(!receipt.retryable);
  });

  for (const ErrorType of [TypeError, RangeError]) {
    it(`treats a ${ErrorType.name} from core as a validation failure`, () => {
      const receipt = createValidationFailure(new ErrorType("Invalid."));
      assert.ok(receipt != null);
      assert.deepEqual(receipt.errorMessages, ["Invalid."]);
      assert.equal(receipt.errors?.[0].category, "validation");
      assert.ok(!receipt.retryable);
    });
  }

  it("leaves any other error alone", () => {
    assert.equal(createValidationFailure(new Error("Boom.")), undefined);
    assert.equal(createValidationFailure("Boom."), undefined);
  });
});

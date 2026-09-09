import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isVerifiableTransport,
  type Transport,
  type VerifiableTransport,
} from "./index.ts";

test("verification is an optional capability preserving the provider", async () => {
  const transport: Transport<"test"> = {
    id: "test",
    send: () => Promise.resolve({ successful: true, messageId: "x" }),
    async *sendMany() {},
  };
  assert.ok(!isVerifiableTransport(transport));
  const invalid = { ...transport, verify: true };
  assert.ok(!isVerifiableTransport(invalid));
  let called = false;
  const capable: Transport<"test"> = Object.assign({}, transport, {
    verify: () => {
      called = true;
      return Promise.resolve();
    },
  });
  assert.ok(isVerifiableTransport(capable));
  const narrowed: VerifiableTransport<"test"> = capable;
  assert.equal(await narrowed.verify(), undefined);
  assert.ok(called);
});

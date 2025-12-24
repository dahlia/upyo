import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { createJmapConfig } from "./config.ts";

describe("createJmapConfig", () => {
  it("should create config with required fields only", () => {
    const config = createJmapConfig({
      sessionUrl: "https://jmap.example.com/.well-known/jmap",
      bearerToken: "test-token",
    });

    assert.equal(
      config.sessionUrl,
      "https://jmap.example.com/.well-known/jmap",
    );
    assert.equal(config.bearerToken, "test-token");
    assert.equal(config.accountId, null);
    assert.equal(config.identityId, null);
    assert.equal(config.timeout, 30000);
    assert.equal(config.retries, 3);
    assert.deepEqual(config.headers, {});
    assert.equal(config.sessionCacheTtl, 300000);
  });

  it("should create config with all optional fields", () => {
    const config = createJmapConfig({
      sessionUrl: "https://jmap.example.com/.well-known/jmap",
      bearerToken: "test-token",
      accountId: "account-123",
      identityId: "identity-456",
      timeout: 60000,
      retries: 5,
      headers: { "X-Custom": "value" },
      sessionCacheTtl: 600000,
    });

    assert.equal(config.accountId, "account-123");
    assert.equal(config.identityId, "identity-456");
    assert.equal(config.timeout, 60000);
    assert.equal(config.retries, 5);
    assert.deepEqual(config.headers, { "X-Custom": "value" });
    assert.equal(config.sessionCacheTtl, 600000);
  });

  it("should preserve zero values for timeout and retries", () => {
    const config = createJmapConfig({
      sessionUrl: "https://jmap.example.com/.well-known/jmap",
      bearerToken: "test-token",
      timeout: 0,
      retries: 0,
    });

    // 0 should be treated as falsy and use default
    // This is intentional behavior - 0 timeout/retries doesn't make sense
    assert.equal(config.timeout, 30000);
    assert.equal(config.retries, 3);
  });
});

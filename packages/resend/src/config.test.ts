import { createResendConfig, type ResendConfig } from "./config.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("createResendConfig", () => {
  it("should apply default values to optional fields", () => {
    const config: ResendConfig = {
      apiKey: "test-api-key",
    };

    const resolved = createResendConfig(config);

    assert.equal(resolved.apiKey, "test-api-key");
    assert.equal(resolved.baseUrl, "https://api.resend.com");
    assert.equal(resolved.timeout, 30000);
    assert.equal(resolved.retries, 3);
    assert.equal(resolved.validateSsl, true);
    assert.deepEqual(resolved.headers, {});
  });

  it("should preserve provided optional values", () => {
    const config: ResendConfig = {
      apiKey: "test-api-key",
      baseUrl: "https://custom.resend.com",
      timeout: 60000,
      retries: 5,
      validateSsl: false,
      headers: { "X-Custom": "value" },
    };

    const resolved = createResendConfig(config);

    assert.equal(resolved.apiKey, "test-api-key");
    assert.equal(resolved.baseUrl, "https://custom.resend.com");
    assert.equal(resolved.timeout, 60000);
    assert.equal(resolved.retries, 5);
    assert.equal(resolved.validateSsl, false);
    assert.deepEqual(resolved.headers, { "X-Custom": "value" });
  });

  it("should handle mixed partial configuration", () => {
    const config: ResendConfig = {
      apiKey: "test-api-key",
      timeout: 45000,
      headers: { "User-Agent": "test-agent" },
    };

    const resolved = createResendConfig(config);

    assert.equal(resolved.apiKey, "test-api-key");
    assert.equal(resolved.baseUrl, "https://api.resend.com"); // default
    assert.equal(resolved.timeout, 45000); // provided
    assert.equal(resolved.retries, 3); // default
    assert.equal(resolved.validateSsl, true); // default
    assert.deepEqual(resolved.headers, { "User-Agent": "test-agent" }); // provided
  });
});

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { createSendGridConfig } from "./config.ts";
import type { SendGridConfig } from "./config.ts";

describe("SendGridConfig", () => {
  it("should create a config with default values", () => {
    const config: SendGridConfig = {
      apiKey: "SG.test-key",
    };

    const resolved = createSendGridConfig(config);

    assert.equal(resolved.apiKey, "SG.test-key");
    assert.equal(resolved.baseUrl, "https://api.sendgrid.com/v3");
    assert.equal(resolved.timeout, 30000);
    assert.equal(resolved.retries, 3);
    assert.equal(resolved.validateSsl, true);
    assert.deepEqual(resolved.headers, {});
    assert.equal(resolved.clickTracking, true);
    assert.equal(resolved.openTracking, true);
    assert.equal(resolved.subscriptionTracking, false);
    assert.equal(resolved.googleAnalytics, false);
  });

  it("should create a config with custom values", () => {
    const config: SendGridConfig = {
      apiKey: "SG.test-key",
      baseUrl: "https://custom.sendgrid.com/v3",
      timeout: 15000,
      retries: 5,
      validateSsl: false,
      headers: { "X-Custom": "value" },
      clickTracking: false,
      openTracking: false,
      subscriptionTracking: true,
      googleAnalytics: true,
    };

    const resolved = createSendGridConfig(config);

    assert.equal(resolved.apiKey, "SG.test-key");
    assert.equal(resolved.baseUrl, "https://custom.sendgrid.com/v3");
    assert.equal(resolved.timeout, 15000);
    assert.equal(resolved.retries, 5);
    assert.equal(resolved.validateSsl, false);
    assert.deepEqual(resolved.headers, { "X-Custom": "value" });
    assert.equal(resolved.clickTracking, false);
    assert.equal(resolved.openTracking, false);
    assert.equal(resolved.subscriptionTracking, true);
    assert.equal(resolved.googleAnalytics, true);
  });

  it("should preserve original config immutability", () => {
    const config: SendGridConfig = {
      apiKey: "SG.test-key",
    };

    const resolved = createSendGridConfig(config);

    // Modify resolved config
    (resolved as Record<string, unknown>).timeout = 60000;

    // Original config should remain unchanged
    assert.equal(config.timeout, undefined);
  });
});

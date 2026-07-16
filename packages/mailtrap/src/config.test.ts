import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMailtrapConfig, type MailtrapConfig } from "./config.ts";

describe("createMailtrapConfig", () => {
  it("applies default values to optional fields", () => {
    const config: MailtrapConfig = {
      apiToken: "test-token",
    };

    const resolved = createMailtrapConfig(config);

    assert.equal(resolved.apiToken, "test-token");
    assert.ok(!resolved.sandbox);
    assert.equal(resolved.inboxId, undefined);
    assert.equal(resolved.sendBaseUrl, "https://send.api.mailtrap.io");
    assert.equal(resolved.sandboxBaseUrl, "https://sandbox.api.mailtrap.io");
    assert.equal(resolved.defaultCategory, "transactional");
    assert.equal(resolved.userAgent, "@upyo/mailtrap");
    assert.equal(resolved.timeout, 30000);
    assert.equal(resolved.retries, 3);
    assert.ok(resolved.validateSsl);
    assert.deepEqual(resolved.headers, {});
    assert.equal(resolved.metadata, undefined);
  });

  it("preserves provided optional values", () => {
    const config: MailtrapConfig = {
      apiToken: "test-token",
      sandbox: true,
      inboxId: 12345,
      sendBaseUrl: "https://send.example.com",
      sandboxBaseUrl: "https://sandbox.example.com",
      defaultCategory: "integration-test",
      metadata: { campaign_id: "welcome-2026" },
      userAgent: "test-agent",
      timeout: 60000,
      retries: 5,
      headers: { "X-Custom": "value" },
    };

    const resolved = createMailtrapConfig(config);

    assert.equal(resolved.apiToken, "test-token");
    assert.ok(resolved.sandbox);
    assert.equal(resolved.inboxId, 12345);
    assert.equal(resolved.sendBaseUrl, "https://send.example.com");
    assert.equal(resolved.sandboxBaseUrl, "https://sandbox.example.com");
    assert.equal(resolved.defaultCategory, "integration-test");
    assert.deepEqual(resolved.metadata, { campaign_id: "welcome-2026" });
    assert.equal(resolved.userAgent, "test-agent");
    assert.equal(resolved.timeout, 60000);
    assert.equal(resolved.retries, 5);
    assert.deepEqual(resolved.headers, { "X-Custom": "value" });
  });

  it("preserves zero timeout and retry values", () => {
    const resolved = createMailtrapConfig({
      apiToken: "test-token",
      timeout: 0,
      retries: 0,
    });

    assert.equal(resolved.timeout, 0);
    assert.equal(resolved.retries, 0);
  });

  it("normalizes trailing slashes from base URLs", () => {
    const resolved = createMailtrapConfig({
      apiToken: "test-token",
      sendBaseUrl: "https://send.example.com///",
      sandboxBaseUrl: "https://sandbox.example.com///",
    });

    assert.equal(resolved.sendBaseUrl, "https://send.example.com");
    assert.equal(resolved.sandboxBaseUrl, "https://sandbox.example.com");
  });

  it("requires inboxId when sandbox mode is enabled", () => {
    assert.throws(
      () =>
        createMailtrapConfig({
          apiToken: "test-token",
          sandbox: true,
        }),
      {
        name: "RangeError",
        message: "`inboxId` is required when Mailtrap sandbox mode is enabled.",
      },
    );
  });
});

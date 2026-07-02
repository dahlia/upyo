import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMailerooConfig, type MailerooConfig } from "./config.ts";

describe("createMailerooConfig", () => {
  it("applies default values to optional fields", () => {
    const config: MailerooConfig = {
      apiKey: "test-key",
    };

    const resolved = createMailerooConfig(config);

    assert.equal(resolved.apiKey, "test-key");
    assert.equal(resolved.baseUrl, "https://smtp.maileroo.com/api/v2");
    assert.equal(resolved.timeout, 30000);
    assert.equal(resolved.retries, 3);
    assert.deepEqual(resolved.headers, {});
    assert.equal(resolved.tracking, undefined);
    assert.equal(resolved.tags, undefined);
  });

  it("preserves provided optional values", () => {
    const config: MailerooConfig = {
      apiKey: "test-key",
      baseUrl: "https://maileroo.example.com/api",
      timeout: 60000,
      retries: 5,
      headers: { "X-Custom": "value" },
      tracking: false,
      tags: { campaign: "welcome" },
    };

    const resolved = createMailerooConfig(config);

    assert.equal(resolved.apiKey, "test-key");
    assert.equal(resolved.baseUrl, "https://maileroo.example.com/api");
    assert.equal(resolved.timeout, 60000);
    assert.equal(resolved.retries, 5);
    assert.deepEqual(resolved.headers, { "X-Custom": "value" });
    assert.ok(!resolved.tracking);
    assert.deepEqual(resolved.tags, { campaign: "welcome" });
  });

  it("clones mutable header and tag defaults", () => {
    const headers = { "X-Custom": "value" };
    const tags = { campaign: "welcome" };
    const resolved = createMailerooConfig({
      apiKey: "test-key",
      headers,
      tags,
    });

    headers["X-Custom"] = "changed";
    tags.campaign = "changed";

    assert.deepEqual(resolved.headers, { "X-Custom": "value" });
    assert.deepEqual(resolved.tags, { campaign: "welcome" });
  });

  it("preserves zero timeout and retry values", () => {
    const resolved = createMailerooConfig({
      apiKey: "test-key",
      timeout: 0,
      retries: 0,
    });

    assert.equal(resolved.timeout, 0);
    assert.equal(resolved.retries, 0);
  });

  it("normalizes trailing slashes from the base URL", () => {
    const resolved = createMailerooConfig({
      apiKey: "test-key",
      baseUrl: "https://maileroo.example.com/api///",
    });

    assert.equal(resolved.baseUrl, "https://maileroo.example.com/api");
  });
});

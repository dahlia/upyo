import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createPlunkConfig } from "./config.ts";
import type { PlunkConfig } from "./config.ts";

describe("createPlunkConfig", () => {
  it("should apply default values for optional fields", () => {
    const config: PlunkConfig = {
      apiKey: "test-api-key",
    };

    const resolved = createPlunkConfig(config);

    assert.equal(resolved.apiKey, "test-api-key");
    assert.equal(resolved.baseUrl, "https://api.useplunk.com");
    assert.equal(resolved.timeout, 30000);
    assert.equal(resolved.retries, 3);
    assert.equal(resolved.validateSsl, true);
    assert.deepEqual(resolved.headers, {});
  });

  it("should preserve provided values", () => {
    const config: PlunkConfig = {
      apiKey: "test-api-key",
      baseUrl: "https://plunk.example.com/api",
      timeout: 60000,
      retries: 5,
      validateSsl: false,
      headers: { "X-Custom-Header": "value" },
    };

    const resolved = createPlunkConfig(config);

    assert.equal(resolved.apiKey, "test-api-key");
    assert.equal(resolved.baseUrl, "https://plunk.example.com/api");
    assert.equal(resolved.timeout, 60000);
    assert.equal(resolved.retries, 5);
    assert.equal(resolved.validateSsl, false);
    assert.deepEqual(resolved.headers, { "X-Custom-Header": "value" });
  });

  it("should handle self-hosted instance URLs", () => {
    const config: PlunkConfig = {
      apiKey: "self-hosted-key",
      baseUrl: "https://mail.company.com/api",
    };

    const resolved = createPlunkConfig(config);

    assert.equal(resolved.baseUrl, "https://mail.company.com/api");
    assert.equal(resolved.apiKey, "self-hosted-key");
  });

  it("should handle empty headers object", () => {
    const config: PlunkConfig = {
      apiKey: "test-key",
      headers: {},
    };

    const resolved = createPlunkConfig(config);

    assert.deepEqual(resolved.headers, {});
  });

  it("should handle multiple custom headers", () => {
    const config: PlunkConfig = {
      apiKey: "test-key",
      headers: {
        "X-Source": "upyo",
        "X-Version": "0.3.0",
        "User-Agent": "custom-agent",
      },
    };

    const resolved = createPlunkConfig(config);

    assert.deepEqual(resolved.headers, {
      "X-Source": "upyo",
      "X-Version": "0.3.0",
      "User-Agent": "custom-agent",
    });
  });

  it("should handle zero timeout and retries", () => {
    const config: PlunkConfig = {
      apiKey: "test-key",
      timeout: 0,
      retries: 0,
    };

    const resolved = createPlunkConfig(config);

    assert.equal(resolved.timeout, 0);
    assert.equal(resolved.retries, 0);
  });
});

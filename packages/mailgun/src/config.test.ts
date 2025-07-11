import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { createMailgunConfig } from "./config.ts";
import type { MailgunConfig } from "./config.ts";

describe("MailgunConfig", () => {
  it("should create a config with default values", () => {
    const config: MailgunConfig = {
      apiKey: "test-key",
      domain: "test-domain.com",
    };

    const resolved = createMailgunConfig(config);

    assert.equal(resolved.apiKey, "test-key");
    assert.equal(resolved.domain, "test-domain.com");
    assert.equal(resolved.region, "us");
    assert.equal(resolved.baseUrl, "https://api.mailgun.net/v3");
    assert.equal(resolved.timeout, 30000);
    assert.equal(resolved.retries, 3);
    assert.equal(resolved.validateSsl, true);
    assert.deepEqual(resolved.headers, {});
    assert.equal(resolved.tracking, true);
    assert.equal(resolved.clickTracking, true);
    assert.equal(resolved.openTracking, true);
  });

  it("should create a config with EU region", () => {
    const config: MailgunConfig = {
      apiKey: "test-key",
      domain: "test-domain.com",
      region: "eu",
    };

    const resolved = createMailgunConfig(config);

    assert.equal(resolved.region, "eu");
    assert.equal(resolved.baseUrl, "https://api.eu.mailgun.net/v3");
  });

  it("should create a config with custom values", () => {
    const config: MailgunConfig = {
      apiKey: "test-key",
      domain: "test-domain.com",
      region: "us",
      baseUrl: "https://custom.api.com/v3",
      timeout: 15000,
      retries: 5,
      validateSsl: false,
      headers: { "X-Custom": "value" },
      tracking: false,
      clickTracking: false,
      openTracking: false,
    };

    const resolved = createMailgunConfig(config);

    assert.equal(resolved.apiKey, "test-key");
    assert.equal(resolved.domain, "test-domain.com");
    assert.equal(resolved.region, "us");
    assert.equal(resolved.baseUrl, "https://custom.api.com/v3");
    assert.equal(resolved.timeout, 15000);
    assert.equal(resolved.retries, 5);
    assert.equal(resolved.validateSsl, false);
    assert.deepEqual(resolved.headers, { "X-Custom": "value" });
    assert.equal(resolved.tracking, false);
    assert.equal(resolved.clickTracking, false);
    assert.equal(resolved.openTracking, false);
  });
});

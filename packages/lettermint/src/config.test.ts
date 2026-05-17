import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createLettermintConfig, type LettermintConfig } from "./config.ts";

describe("createLettermintConfig", () => {
  it("applies default values to optional fields", () => {
    const config: LettermintConfig = {
      apiToken: "test-token",
    };

    const resolved = createLettermintConfig(config);

    assert.equal(resolved.apiToken, "test-token");
    assert.equal(resolved.baseUrl, "https://api.lettermint.co");
    assert.equal(resolved.timeout, 30000);
    assert.equal(resolved.retries, 3);
    assert.equal(resolved.validateSsl, true);
    assert.deepEqual(resolved.headers, {});
    assert.equal(resolved.route, undefined);
    assert.equal(resolved.tag, undefined);
    assert.equal(resolved.metadata, undefined);
    assert.equal(resolved.settings, undefined);
  });

  it("preserves provided optional values", () => {
    const config: LettermintConfig = {
      apiToken: "test-token",
      baseUrl: "https://lettermint.example.com",
      timeout: 60000,
      retries: 5,
      validateSsl: false,
      headers: { "X-Custom": "value" },
      route: "transactional",
      tag: "welcome",
      metadata: { campaign_id: "welcome-2026" },
      settings: {
        trackOpens: false,
        trackClicks: true,
      },
    };

    const resolved = createLettermintConfig(config);

    assert.equal(resolved.apiToken, "test-token");
    assert.equal(resolved.baseUrl, "https://lettermint.example.com");
    assert.equal(resolved.timeout, 60000);
    assert.equal(resolved.retries, 5);
    assert.equal(resolved.validateSsl, false);
    assert.deepEqual(resolved.headers, { "X-Custom": "value" });
    assert.equal(resolved.route, "transactional");
    assert.equal(resolved.tag, "welcome");
    assert.deepEqual(resolved.metadata, { campaign_id: "welcome-2026" });
    assert.deepEqual(resolved.settings, {
      trackOpens: false,
      trackClicks: true,
    });
  });

  it("preserves zero timeout and retry values", () => {
    const resolved = createLettermintConfig({
      apiToken: "test-token",
      timeout: 0,
      retries: 0,
    });

    assert.equal(resolved.timeout, 0);
    assert.equal(resolved.retries, 0);
  });
});

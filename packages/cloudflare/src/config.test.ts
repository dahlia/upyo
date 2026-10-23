import { createCloudflareConfig } from "./config.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("createCloudflareConfig", () => {
  it("applies defaults", () => {
    const resolved = createCloudflareConfig({
      accountId: "acc",
      apiToken: "tok",
    });
    assert.equal(resolved.baseUrl, "https://api.cloudflare.com/client/v4");
    assert.equal(resolved.timeout, 30000);
    assert.equal(resolved.retries, 3);
    assert.deepEqual(resolved.headers, {});
  });

  it("preserves provided values", () => {
    const resolved = createCloudflareConfig({
      accountId: "acc",
      apiToken: "tok",
      baseUrl: "https://example.test",
      timeout: 1,
      retries: 0,
      headers: { "X-A": "b" },
    });
    assert.equal(resolved.baseUrl, "https://example.test");
    assert.equal(resolved.timeout, 1);
    assert.equal(resolved.retries, 0);
    assert.deepEqual(resolved.headers, { "X-A": "b" });
  });

  it("has no validateSsl option, since fetch always validates", () => {
    const resolved = createCloudflareConfig({ accountId: "a", apiToken: "t" });
    assert.ok(!("validateSsl" in resolved));
  });

  it("rejects an empty account ID or API token", () => {
    assert.throws(
      () => createCloudflareConfig({ accountId: "", apiToken: "tok" }),
      TypeError,
    );
    assert.throws(
      () => createCloudflareConfig({ accountId: "acc", apiToken: "" }),
      TypeError,
    );
  });
});

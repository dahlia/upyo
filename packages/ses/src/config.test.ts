import { test } from "node:test";
import { strict as assert } from "node:assert";
import { createSesConfig } from "./config.ts";
import type { SesConfig } from "./config.ts";

test("createSesConfig applies default values", () => {
  const config: SesConfig = {
    authentication: {
      type: "credentials",
      accessKeyId: "test-key",
      secretAccessKey: "test-secret",
    },
  };

  const resolved = createSesConfig(config);

  assert.equal(resolved.region, "us-east-1");
  assert.equal(resolved.timeout, 30000);
  assert.equal(resolved.retries, 3);
  assert.equal(resolved.validateSsl, true);
  assert.deepEqual(resolved.headers, {});
  assert.deepEqual(resolved.defaultTags, {});
  assert.equal(resolved.configurationSetName, undefined);
});

test("createSesConfig preserves provided values", () => {
  const config: SesConfig = {
    authentication: {
      type: "session",
      accessKeyId: "test-key",
      secretAccessKey: "test-secret",
      sessionToken: "test-token",
    },
    region: "eu-west-1",
    timeout: 15000,
    retries: 5,
    validateSsl: false,
    headers: { "X-Custom": "value" },
    configurationSetName: "test-config-set",
    defaultTags: { environment: "test" },
  };

  const resolved = createSesConfig(config);

  assert.deepEqual(resolved.authentication, config.authentication);
  assert.equal(resolved.region, "eu-west-1");
  assert.equal(resolved.timeout, 15000);
  assert.equal(resolved.retries, 5);
  assert.equal(resolved.validateSsl, false);
  assert.deepEqual(resolved.headers, { "X-Custom": "value" });
  assert.equal(resolved.configurationSetName, "test-config-set");
  assert.deepEqual(resolved.defaultTags, { environment: "test" });
});

test("createSesConfig handles credentials authentication", () => {
  const config: SesConfig = {
    authentication: {
      type: "credentials",
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    },
  };

  const resolved = createSesConfig(config);

  assert.equal(resolved.authentication.type, "credentials");
  if (resolved.authentication.type === "credentials") {
    assert.equal(resolved.authentication.accessKeyId, "AKIAIOSFODNN7EXAMPLE");
    assert.equal(
      resolved.authentication.secretAccessKey,
      "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    );
  }
});

test("createSesConfig handles session authentication", () => {
  const config: SesConfig = {
    authentication: {
      type: "session",
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      sessionToken: "example-session-token",
    },
  };

  const resolved = createSesConfig(config);

  assert.equal(resolved.authentication.type, "session");
  if (resolved.authentication.type === "session") {
    assert.equal(resolved.authentication.accessKeyId, "AKIAIOSFODNN7EXAMPLE");
    assert.equal(
      resolved.authentication.secretAccessKey,
      "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    );
    assert.equal(resolved.authentication.sessionToken, "example-session-token");
  }
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import process from "node:process";
import { getTestConfig, isE2eTestingEnabled } from "./test-config.ts";

const environmentKeys = [
  "MAILTRAP_API_TOKEN",
  "MAILTRAP_INBOX_ID",
  "MAILTRAP_FROM",
  "MAILTRAP_TO",
] as const;

describe("Mailtrap E2E test config", () => {
  it("rejects invalid email addresses", () => {
    const originalEnvironment = Object.fromEntries(
      environmentKeys.map((key) => [key, process.env[key]]),
    );

    try {
      process.env.MAILTRAP_API_TOKEN = "test-token";
      process.env.MAILTRAP_INBOX_ID = "12345";
      process.env.MAILTRAP_FROM = "not-an-email";
      process.env.MAILTRAP_TO = "recipient@example.com";

      assert.ok(!isE2eTestingEnabled());
      assert.throws(getTestConfig, {
        name: "TypeError",
        message: "MAILTRAP_FROM and MAILTRAP_TO must be valid email addresses.",
      });
    } finally {
      for (const key of environmentKeys) {
        const value = originalEnvironment[key];
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
  });
});

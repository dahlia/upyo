import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createSmtpConfig } from "./config.ts";

describe("createSmtpConfig", () => {
  test("should not require TLS by default", () => {
    const config = createSmtpConfig({ host: "smtp.example.com" });

    assert.ok(!config.requireTls);
  });

  test("should preserve an explicit TLS requirement", () => {
    const config = createSmtpConfig({
      host: "smtp.example.com",
      requireTls: true,
    });

    assert.ok(config.requireTls);
  });
});

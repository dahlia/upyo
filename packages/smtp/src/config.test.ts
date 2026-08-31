import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createSmtpConfig } from "./config.ts";

describe("createSmtpConfig", () => {
  test("should disable implicit TLS by default on port 587", () => {
    const config = createSmtpConfig({ host: "smtp.example.com" });

    assert.equal(config.port, 587);
    assert.ok(!config.secure);
  });

  test("should enable implicit TLS by default on port 465", () => {
    const config = createSmtpConfig({
      host: "smtp.example.com",
      port: 465,
    });

    assert.ok(config.secure);
  });

  test("should disable implicit TLS by default on other ports", () => {
    const config = createSmtpConfig({
      host: "smtp.example.com",
      port: 25,
    });

    assert.ok(!config.secure);
  });

  test("should preserve explicit implicit TLS settings", () => {
    const secureConfig = createSmtpConfig({
      host: "smtp.example.com",
      port: 587,
      secure: true,
    });
    const insecureConfig = createSmtpConfig({
      host: "smtp.example.com",
      port: 465,
      secure: false,
    });

    assert.ok(secureConfig.secure);
    assert.ok(!insecureConfig.secure);
  });

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

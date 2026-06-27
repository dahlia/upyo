import assert from "node:assert/strict";
import { Socket } from "node:net";
import { describe, test } from "node:test";
import type { SmtpConfig } from "./config.ts";
import { SmtpConnection } from "./smtp-connection.ts";
import { SmtpAuthError } from "./oauth2.ts";
import { MockSmtpServer } from "./test-utils/mock-smtp-server.ts";

describe("SMTP OAuth 2.0 authentication", () => {
  async function setup(auth: SmtpConfig["auth"]) {
    const server = new MockSmtpServer();
    await server.start();
    const config: SmtpConfig = {
      host: "localhost",
      port: server.getPort(),
      secure: false,
      connectionTimeout: 5000,
      socketTimeout: 5000,
      localName: "test.local",
      auth,
    };
    const connection = new SmtpConnection(config);
    return { server, connection };
  }

  async function teardown(server: MockSmtpServer, connection: SmtpConnection) {
    try {
      await connection.quit();
    } catch {
      // Ignore cleanup errors.
    }
    await server.stop();
    await new Promise((resolve) => setTimeout(resolve, 1));
  }

  function decodeAuthInitialResponse(authCommand: string): string {
    const parts = authCommand.split(" ");
    return atob(parts[2]);
  }

  test("authenticates with XOAUTH2 using a static token", async () => {
    const { server, connection } = await setup({
      user: "user@example.com",
      accessToken: "the-access-token",
    });
    try {
      await connection.connect();
      await connection.greeting();
      await connection.ehlo();
      await connection.authenticate();

      assert.ok(connection.authenticated);
      const command = server.getLastAuthCommand();
      assert.ok(command != null);
      assert.ok(command!.startsWith("AUTH XOAUTH2 "));
      assert.equal(
        decodeAuthInitialResponse(command!),
        "user=user@example.com\x01auth=Bearer the-access-token\x01\x01",
      );
    } finally {
      await teardown(server, connection);
    }
  });

  test("authenticates with XOAUTH2 using a synchronous token provider", async () => {
    let called = false;
    const { server, connection } = await setup({
      user: "user@example.com",
      accessToken: () => {
        called = true;
        return "provided-token";
      },
    });
    try {
      await connection.connect();
      await connection.greeting();
      await connection.ehlo();
      await connection.authenticate();

      assert.ok(connection.authenticated);
      assert.ok(called);
    } finally {
      await teardown(server, connection);
    }
  });

  test("uses the two-step SASL form for an over-long XOAUTH2 token", async () => {
    // A long token (e.g. an Outlook JWT) overflows the SMTP command-line limit,
    // so the initial response must be sent on its own line after a 334.
    const longToken = "x".repeat(800);
    const { server, connection } = await setup({
      user: "user@example.com",
      accessToken: longToken,
    });
    try {
      await connection.connect();
      await connection.greeting();
      await connection.ehlo();
      await connection.authenticate();

      assert.ok(connection.authenticated);
      // The AUTH command carried no inline initial response.
      assert.equal(server.getLastAuthCommand(), "AUTH XOAUTH2");
    } finally {
      await teardown(server, connection);
    }
  });

  test("authenticates with XOAUTH2 using an asynchronous token provider", async () => {
    const { server, connection } = await setup({
      user: "user@example.com",
      accessToken: () => Promise.resolve("async-token"),
    });
    try {
      await connection.connect();
      await connection.greeting();
      await connection.ehlo();
      await connection.authenticate();

      assert.ok(connection.authenticated);
    } finally {
      await teardown(server, connection);
    }
  });

  test("rejects XOAUTH2 failure via the 334 challenge continuation", async () => {
    const { server, connection } = await setup({
      user: "user@example.com",
      accessToken: "bad-token",
    });
    server.setResponse("AUTH", { code: 535, message: "5.7.8 Bad credentials" });
    try {
      await connection.connect();
      await connection.greeting();
      await connection.ehlo();

      await assert.rejects(
        connection.authenticate(),
        (error: unknown) =>
          error instanceof SmtpAuthError && /XOAUTH2/.test(error.message) &&
          // The empty continuation was accepted, so the final server reply is
          // the real failure rather than a rejected-continuation error.
          /Bad credentials/.test(error.message),
      );
      assert.ok(!connection.authenticated);
    } finally {
      await teardown(server, connection);
    }
  });

  test("authenticates with OAUTHBEARER including host and port", async () => {
    const { server, connection } = await setup({
      user: "user@example.com",
      accessToken: "the-access-token",
      method: "oauthbearer",
    });
    try {
      await connection.connect();
      await connection.greeting();
      await connection.ehlo();
      await connection.authenticate();

      assert.ok(connection.authenticated);
      const command = server.getLastAuthCommand();
      assert.ok(command != null);
      assert.ok(command!.startsWith("AUTH OAUTHBEARER "));
      const decoded = decodeAuthInitialResponse(command!);
      assert.ok(decoded.startsWith("n,a=user@example.com,\x01"));
      assert.ok(decoded.includes("\x01host=localhost\x01"));
      assert.ok(decoded.includes(`\x01port=${server.getPort()}\x01`));
      assert.ok(decoded.endsWith("\x01auth=Bearer the-access-token\x01\x01"));
    } finally {
      await teardown(server, connection);
    }
  });

  test("rejects OAUTHBEARER failure via the 334 challenge continuation", async () => {
    const { server, connection } = await setup({
      user: "user@example.com",
      accessToken: "bad-token",
      method: "oauthbearer",
    });
    server.setResponse("AUTH", { code: 535, message: "5.7.8 Bad credentials" });
    try {
      await connection.connect();
      await connection.greeting();
      await connection.ehlo();

      await assert.rejects(
        connection.authenticate(),
        (error: unknown) =>
          error instanceof SmtpAuthError && /OAUTHBEARER/.test(error.message) &&
          // The "AQ==" continuation was accepted, so the final server reply is
          // the real failure rather than a rejected-continuation error.
          /Bad credentials/.test(error.message),
      );
      assert.ok(!connection.authenticated);
    } finally {
      await teardown(server, connection);
    }
  });

  test("auto-selects XOAUTH2 when method is omitted", async () => {
    const { server, connection } = await setup({
      user: "user@example.com",
      accessToken: "the-access-token",
    });
    try {
      await connection.connect();
      await connection.greeting();
      await connection.ehlo();
      await connection.authenticate();

      const command = server.getLastAuthCommand();
      assert.ok(command!.startsWith("AUTH XOAUTH2 "));
    } finally {
      await teardown(server, connection);
    }
  });

  test("refuses OAuth over a cleartext non-loopback connection", async () => {
    const connection = new SmtpConnection({
      host: "smtp.example.com",
      port: 25,
      secure: false,
      auth: { user: "user@example.com", accessToken: "the-access-token" },
    });
    // Simulate a post-EHLO plaintext connection without dialing out; the TLS
    // guard rejects before the socket is used.
    const socket = new Socket();
    connection.socket = socket;
    connection.capabilities = ["AUTH XOAUTH2"];
    try {
      await assert.rejects(
        connection.authenticate(),
        (error: unknown) =>
          error instanceof SmtpAuthError && /TLS/.test(error.message),
      );
      assert.ok(!connection.authenticated);
    } finally {
      socket.destroy();
    }
  });
});

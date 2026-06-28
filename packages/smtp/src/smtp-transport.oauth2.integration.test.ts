import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { SmtpConfig } from "./config.ts";
import { SmtpTransport } from "./smtp-transport.ts";
import { MockSmtpServer } from "./test-utils/mock-smtp-server.ts";
import { createTestMessage } from "./test-utils/test-config.ts";

describe("SmtpTransport OAuth 2.0 integration", () => {
  async function setup(
    auth: SmtpConfig["auth"],
    overrides: Partial<SmtpConfig> = {},
  ) {
    const server = new MockSmtpServer();
    await server.start();
    const transport = new SmtpTransport({
      host: "localhost",
      port: server.getPort(),
      secure: false,
      connectionTimeout: 5000,
      socketTimeout: 5000,
      auth,
      ...overrides,
    });
    return { server, transport };
  }

  test("sends a message authenticated with a static XOAUTH2 token", async () => {
    const { server, transport } = await setup({
      user: "user@example.com",
      accessToken: "the-access-token",
    });
    try {
      const receipt = await transport.send(createTestMessage());
      assert.ok(receipt.successful);
      assert.equal(server.getReceivedMessages().length, 1);
      assert.ok(server.getLastAuthCommand()?.startsWith("AUTH XOAUTH2 "));
    } finally {
      await transport.closeAllConnections();
      await server.stop();
    }
  });

  test("sends a message authenticated with OAUTHBEARER", async () => {
    const { server, transport } = await setup({
      user: "user@example.com",
      accessToken: "the-access-token",
      method: "oauthbearer",
    });
    try {
      const receipt = await transport.send(createTestMessage());
      assert.ok(receipt.successful);
      assert.ok(server.getLastAuthCommand()?.startsWith("AUTH OAUTHBEARER "));
    } finally {
      await transport.closeAllConnections();
      await server.stop();
    }
  });

  test("shares one refreshed access token across connections", async () => {
    const originalFetch = globalThis.fetch;
    let fetchCalls = 0;
    globalThis.fetch = ((_input: RequestInfo | URL, _init?: RequestInit) => {
      fetchCalls++;
      return Promise.resolve(
        new Response(
          JSON.stringify({ access_token: "refreshed", expires_in: 3600 }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    }) as typeof fetch;

    let server: MockSmtpServer | undefined;
    let transport: SmtpTransport | undefined;
    try {
      // Pooling disabled so each send uses a fresh connection that
      // authenticates independently; the shared token manager must still
      // refresh only once.
      ({ server, transport } = await setup({
        user: "user@example.com",
        clientId: "client-id",
        clientSecret: "client-secret",
        refreshToken: "refresh-token",
        tokenEndpoint: "https://oauth2.example.com/token",
      }, { pool: false }));

      const first = await transport.send(createTestMessage());
      const second = await transport.send(createTestMessage());
      assert.ok(first.successful);
      assert.ok(second.successful);
      assert.equal(
        fetchCalls,
        1,
        "the refresh token is exchanged once and cached across connections",
      );
    } finally {
      globalThis.fetch = originalFetch;
      await transport?.closeAllConnections();
      await server?.stop();
    }
  });

  test("reports a failed receipt when OAuth authentication is rejected", async () => {
    // Authentication happens while establishing the connection; like other SMTP
    // setup failures, a rejected token yields a failed receipt rather than
    // throwing.
    const { server, transport } = await setup({
      user: "user@example.com",
      accessToken: "bad-token",
    });
    server.setResponse("AUTH", { code: 535, message: "5.7.8 Bad credentials" });
    try {
      const receipt = await transport.send(createTestMessage());
      assert.ok(!receipt.successful);
      if (!receipt.successful) {
        assert.ok(receipt.errorMessages.some((m) => /XOAUTH2/.test(m)));
      }
    } finally {
      await transport.closeAllConnections();
      await server.stop();
    }
  });
});

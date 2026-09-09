import assert from "node:assert/strict";
import { test } from "node:test";
import { createMessage, isVerifiableTransport } from "@upyo/core";
import {
  SmtpAuthResponseError,
  SmtpResponseError,
  SmtpTransport,
} from "@upyo/smtp";
import { MockSmtpServer } from "./test-utils/mock-smtp-server.ts";

const message = () =>
  createMessage({
    from: "a@example.com",
    to: "b@example.com",
    subject: "Test",
    content: { text: "Test" },
  });

for (
  const auth of [undefined, { user: "u", pass: "p" }, {
    user: "u",
    accessToken: "token",
  }] as const
) {
  test(`verify performs fresh setup without delivery, auth=${auth == null ? "none" : "pass" in auth ? "password" : "oauth"}`, async () => {
    const server = new MockSmtpServer();
    const port = await server.start();
    const transport = new SmtpTransport({
      host: "localhost",
      port,
      auth,
      poolSize: 1,
    });
    try {
      assert.ok(isVerifiableTransport(transport));
      assert.equal(await transport.verify(), undefined);
      await transport.verify();
      assert.equal(server.getConnectionCount(), 2);
      assert.equal(server.getReceivedMessages().length, 0);
      assert.ok(
        server.getReceivedCommands().every((c) =>
          /^(EHLO|HELO|AUTH|QUIT)\b/.test(c)
        ),
      );
      if (auth) {
        server.setResponse("AUTH", {
          code: 535,
          message: "Invalid credentials",
        });
        await assert.rejects(transport.verify(), SmtpAuthResponseError);
      }
    } finally {
      await transport.closeAllConnections();
      await server.stop();
    }
  });
}

test("verification rejects greeting/EHLO/TLS errors and releases capacity", async () => {
  const server = new MockSmtpServer();
  const port = await server.start();
  const transport = new SmtpTransport({ host: "localhost", port, poolSize: 1 });
  try {
    server.setResponse("GREETING", { code: 554, message: "Unavailable" });
    await assert.rejects(
      transport.verify(),
      (e: unknown) =>
        e instanceof SmtpResponseError && e.command === "GREETING",
    );
    server.setResponse("GREETING", { code: 220, message: "Ready" });
    server.setResponse("EHLO", { code: 500, message: "Unsupported" });
    await transport.verify();
    assert.ok(server.getReceivedCommands().some((c) => c.startsWith("HELO ")));
    server.setResponse("HELO", { code: 550, message: "Rejected" });
    await assert.rejects(transport.verify(), SmtpResponseError);
    server.setResponse("EHLO", { code: 250, message: "Ready" });
    transport.config = { ...transport.config, requireTls: true };
    server.setResponse("STARTTLS", { code: 454, message: "Unavailable" });
    await assert.rejects(
      transport.verify(),
      (e: unknown) =>
        e instanceof SmtpResponseError && e.command === "STARTTLS",
    );
    transport.config = { ...transport.config, requireTls: false };
    await transport.verify();
  } finally {
    await transport.closeAllConnections();
    await server.stop();
  }
});

test("fresh verification keeps its slot while a token callback is pending", async () => {
  const server = new MockSmtpServer();
  const port = await server.start();
  const entered = Promise.withResolvers<void>();
  const token = Promise.withResolvers<string>();
  let calls = 0;
  const transport = new SmtpTransport({
    host: "localhost",
    port,
    poolSize: 1,
    auth: {
      user: "u",
      accessToken: () => {
        if (++calls === 2) {
          entered.resolve();
          return token.promise;
        }
        return "token";
      },
    },
  });
  try {
    assert.ok((await transport.send(message())).successful);
    const verification = transport.verify();
    await entered.promise;
    const controller = new AbortController();
    const queued = transport.verify({ signal: controller.signal });
    controller.abort("queued cancellation");
    await assert.rejects(queued, (e) => e === "queued cancellation");
    const send = transport.send(message());
    assert.equal(server.getConnectionCount(), 2);
    assert.equal(calls, 2);
    token.resolve("token");
    await verification;
    assert.ok((await send).successful);
    assert.equal(calls, 3);
  } finally {
    token.resolve("token");
    await transport.closeAllConnections();
    await server.stop();
  }
});

test("verification cancellation releases a slot held by an uncooperative token provider", async () => {
  const server = new MockSmtpServer();
  const port = await server.start();
  const entered = Promise.withResolvers<void>();
  const token = Promise.withResolvers<string>();
  let calls = 0;
  const transport = new SmtpTransport({
    host: "localhost",
    port,
    poolSize: 1,
    auth: {
      user: "u",
      accessToken: () => {
        if (++calls === 1) {
          entered.resolve();
          return token.promise;
        }
        return "token";
      },
    },
  });
  try {
    const controller = new AbortController();
    const pending = transport.verify({ signal: controller.signal });
    await entered.promise;
    controller.abort("stop");
    await assert.rejects(pending, (e) => e === "stop");
    token.reject(new TypeError("Late failure."));
    await transport.verify();
    const aborted = new AbortController();
    aborted.abort(null);
    await assert.rejects(
      transport.verify({ signal: aborted.signal }),
      (e) => e === null,
    );
    assert.equal(server.getConnectionCount(), 2);
  } finally {
    token.resolve("token");
    await transport.closeAllConnections();
    await server.stop();
  }
});

for (const warm of [false, true]) {
  test(`cancel during ${warm ? "eviction" : "final"} QUIT releases exactly one slot`, async () => {
    const { SmtpConnection } = await import("./smtp-connection.ts");
    const { SmtpTransport } = await import("./smtp-transport.ts");
    const server = new MockSmtpServer();
    const port = await server.start();
    const transport = new SmtpTransport({
      host: "localhost",
      port,
      poolSize: 1,
    });
    const entered = Promise.withResolvers<void>();
    const controller = new AbortController();
    const originalQuit = SmtpConnection.prototype.quit;
    try {
      if (warm) assert.ok((await transport.send(message())).successful);
      SmtpConnection.prototype.quit = async function (signal?: AbortSignal) {
        const socket = this.socket;
        assert.ok(socket);
        const write = socket.write;
        socket.write = () => {
          entered.resolve();
          return true;
        };
        try {
          await originalQuit.call(this, signal);
        } finally {
          socket.write = write;
        }
      };
      const pending = transport.verify({ signal: controller.signal });
      const checked = assert.rejects(pending, (e) => e === "stop cleanup");
      await entered.promise;
      controller.abort("stop cleanup");
      await checked;
      SmtpConnection.prototype.quit = originalQuit;
      await transport.verify();
      assert.ok((await transport.send(message())).successful);
    } finally {
      controller.abort("stop cleanup");
      SmtpConnection.prototype.quit = originalQuit;
      await transport.closeAllConnections();
      await server.stop();
    }
  });
}

test("shutdown drains admitted verification and newly arriving verification can cancel", async () => {
  const server = new MockSmtpServer();
  const port = await server.start();
  const entered = Promise.withResolvers<void>();
  const token = Promise.withResolvers<string>();
  const transport = new SmtpTransport({
    host: "localhost",
    port,
    poolSize: 1,
    auth: {
      user: "u",
      accessToken: () => {
        entered.resolve();
        return token.promise;
      },
    },
  });
  try {
    const pending = transport.verify();
    await entered.promise;
    const closing = transport.closeAllConnections();
    const controller = new AbortController();
    const waiting = transport.verify({ signal: controller.signal });
    controller.abort("shutdown wait");
    await assert.rejects(waiting, (e) => e === "shutdown wait");
    token.resolve("token");
    await pending;
    await closing;
    await transport.verify();
  } finally {
    token.resolve("token");
    await transport.closeAllConnections();
    await server.stop();
  }
});

test("failed connection establishment does not leak the verification slot", async () => {
  const server = new MockSmtpServer();
  const port = await server.start();
  await server.stop();
  const transport = new SmtpTransport({
    host: "localhost",
    port,
    poolSize: 1,
    connectionTimeout: 500,
  });
  try {
    await assert.rejects(transport.verify());
    await assert.rejects(transport.verify());
  } finally {
    await transport.closeAllConnections();
  }
});

test("cancelled verification does not cancel a shared OAuth2 refresh needed by a send", async () => {
  const originalFetch = globalThis.fetch;
  const entered = Promise.withResolvers<void>();
  const refreshed = Promise.withResolvers<Response>();
  let refreshes = 0;
  globalThis.fetch = () => {
    refreshes++;
    entered.resolve();
    return refreshed.promise;
  };
  const server = new MockSmtpServer();
  const port = await server.start();
  const transport = new SmtpTransport({
    host: "localhost",
    port,
    poolSize: 2,
    auth: {
      user: "u",
      clientId: "client",
      refreshToken: "refresh",
      tokenEndpoint: "https://oauth.example.com/token",
    },
  });
  const controller = new AbortController();
  try {
    const verification = transport.verify({ signal: controller.signal });
    const checked = assert.rejects(
      verification,
      (e) => e === "cancel verifier",
    );
    await entered.promise;
    const send = transport.send(message());
    controller.abort("cancel verifier");
    await checked;
    refreshed.resolve(
      new Response(
        JSON.stringify({ access_token: "token", expires_in: 3600 }),
        { status: 200 },
      ),
    );
    assert.ok((await send).successful);
    assert.equal(refreshes, 1);
  } finally {
    controller.abort("cancel verifier");
    refreshed.resolve(
      new Response(
        JSON.stringify({ access_token: "token", expires_in: 3600 }),
        { status: 200 },
      ),
    );
    globalThis.fetch = originalFetch;
    await transport.closeAllConnections();
    await server.stop();
  }
});

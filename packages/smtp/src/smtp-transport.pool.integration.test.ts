import type { Message } from "@upyo/core";
import { SmtpTransport } from "@upyo/smtp";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { MockSmtpServer } from "./test-utils/mock-smtp-server.ts";

describe("SmtpTransport connection limit", () => {
  function createTestMessage(overrides: Partial<Message> = {}): Message {
    return {
      sender: { name: "John Doe", address: "john@example.com" },
      recipients: [{ name: "Jane Doe", address: "jane@example.com" }],
      ccRecipients: [],
      bccRecipients: [],
      replyRecipients: [],
      subject: "Test Subject",
      content: { text: "Hello, World!" },
      attachments: [],
      priority: "normal",
      tags: [],
      headers: new Headers(),
      ...overrides,
    };
  }

  async function setupTest(
    options: { readonly pool?: boolean; readonly poolSize: number },
  ) {
    const server = new MockSmtpServer();
    const serverPort = await server.start();

    const transport = new SmtpTransport({
      host: "localhost",
      port: serverPort,
      secure: false,
      connectionTimeout: 5000,
      socketTimeout: 5000,
      pool: options.pool ?? true,
      poolSize: options.poolSize,
    });

    return { server, transport };
  }

  async function teardownTest(
    server: MockSmtpServer,
    transport: SmtpTransport,
  ) {
    await transport.closeAllConnections();
    await server.stop();
    await new Promise((resolve) => setTimeout(resolve, 1));
  }

  test("concurrent sends never exceed poolSize connections", async () => {
    const { server, transport } = await setupTest({ poolSize: 3 });

    try {
      const receipts = await Promise.all(
        Array.from({ length: 12 }, () => transport.send(createTestMessage())),
      );

      for (const receipt of receipts) {
        assert.ok(
          receipt.successful,
          `Expected every send to succeed, got: ${
            receipt.successful ? "" : receipt.errorMessages.join(", ")
          }`,
        );
      }
      assert.ok(
        server.getPeakConcurrentConnections() <= 3,
        `Expected at most 3 simultaneous connections, saw ${server.getPeakConcurrentConnections()}`,
      );
      assert.strictEqual(server.getReceivedMessages().length, 12);
    } finally {
      await teardownTest(server, transport);
    }
  });

  test("concurrent sendMany calls never exceed poolSize connections", async () => {
    const { server, transport } = await setupTest({ poolSize: 2 });

    try {
      await Promise.all(
        Array.from({ length: 6 }, async () => {
          const messages = [createTestMessage(), createTestMessage()];
          for await (const receipt of transport.sendMany(messages)) {
            assert.ok(receipt.successful);
          }
        }),
      );

      assert.ok(
        server.getPeakConcurrentConnections() <= 2,
        `Expected at most 2 simultaneous connections, saw ${server.getPeakConcurrentConnections()}`,
      );
    } finally {
      await teardownTest(server, transport);
    }
  });

  test("overlapping returns never leave more idle connections than poolSize", async () => {
    const { server, transport } = await setupTest({ poolSize: 3 });
    // A slow RSET keeps several returns in flight at once, which is the window
    // where a plain length check lets every return past the limit.
    server.setResponseDelay("RSET", 40);

    try {
      await Promise.all(
        Array.from({ length: 9 }, () => transport.send(createTestMessage())),
      );

      assert.ok(
        server.getPeakConcurrentConnections() <= 3,
        `Expected at most 3 simultaneous connections, saw ${server.getPeakConcurrentConnections()}`,
      );
      assert.ok(
        server.getActiveConnectionCount() <= 3,
        `Expected at most 3 retained connections, saw ${server.getActiveConnectionCount()}`,
      );
    } finally {
      await teardownTest(server, transport);
    }
  });

  test("the limit applies even when pooling is disabled", async () => {
    const { server, transport } = await setupTest({
      pool: false,
      poolSize: 2,
    });

    try {
      await Promise.all(
        Array.from({ length: 8 }, () => transport.send(createTestMessage())),
      );

      assert.ok(
        server.getPeakConcurrentConnections() <= 2,
        `Expected at most 2 simultaneous connections, saw ${server.getPeakConcurrentConnections()}`,
      );
    } finally {
      await teardownTest(server, transport);
    }
  });

  test("aborting while waiting for capacity rejects without sending", async () => {
    const { server, transport } = await setupTest({ poolSize: 1 });
    // Hold the only connection inside DATA long enough for the second send to
    // queue behind it.
    server.setResponseDelay("DATA_END", 300);

    try {
      const first = transport.send(createTestMessage({ subject: "first" }));

      const controller = new AbortController();
      const waiting = transport.send(
        createTestMessage({ subject: "waiting" }),
        { signal: controller.signal },
      );
      const rejection = assert.rejects(
        () => waiting,
        (error: Error) => error.name === "AbortError",
      );
      await new Promise((resolve) => setTimeout(resolve, 20));
      controller.abort();
      await rejection;

      const firstReceipt = await first;
      assert.ok(firstReceipt.successful);

      const subjects = server.getReceivedMessages().map((message) =>
        /Subject: (.*)/.exec(message.data)?.[1]?.trim()
      );
      assert.ok(!subjects.includes("waiting"));
    } finally {
      await teardownTest(server, transport);
    }
  });

  test("aborting a waiting send does not leak capacity", async () => {
    const { server, transport } = await setupTest({ poolSize: 1 });
    server.setResponseDelay("DATA_END", 200);

    try {
      const first = transport.send(createTestMessage());

      const controller = new AbortController();
      const waiting = transport.send(createTestMessage(), {
        signal: controller.signal,
      });
      const rejection = assert.rejects(() => waiting);
      // Queued behind the send that gets aborted, so it can only proceed if the
      // aborted one leaves the queue and passes its wake-up along.
      const queued = transport.send(createTestMessage());

      await new Promise((resolve) => setTimeout(resolve, 20));
      controller.abort();
      await rejection;

      assert.ok((await first).successful);
      assert.ok((await queued).successful);

      // The aborted send must have given its place back, so this one proceeds.
      server.setResponseDelay("DATA_END", 0);
      const later = await transport.send(createTestMessage());
      assert.ok(later.successful);
    } finally {
      await teardownTest(server, transport);
    }
  });

  test("a failed connection setup gives its slot back", async () => {
    const { server, transport } = await setupTest({ poolSize: 1 });
    server.setResponse("EHLO", { code: 550, message: "Not today" });

    try {
      const failed = await transport.send(createTestMessage());
      assert.ok(!failed.successful);

      // The only slot was reserved before the handshake, so a leak here would
      // make every later send wait forever.
      server.setResponse("EHLO", {
        code: 250,
        message: "Hello, pleased to meet you",
      });
      const later = await transport.send(createTestMessage());
      assert.ok(later.successful);
    } finally {
      await teardownTest(server, transport);
    }
  });

  test("abandoning sendMany early releases the connection", async () => {
    const { server, transport } = await setupTest({ poolSize: 1 });

    try {
      const messages = [
        createTestMessage(),
        createTestMessage(),
        createTestMessage(),
      ];
      for await (const receipt of transport.sendMany(messages)) {
        assert.ok(receipt.successful);
        break;
      }

      // The abandoned iteration must not keep the only connection slot.
      const later = await transport.send(createTestMessage());
      assert.ok(later.successful);
      assert.ok(server.getPeakConcurrentConnections() <= 1);
    } finally {
      await teardownTest(server, transport);
    }
  });

  test("closing the pool while a send runs stays within poolSize", async () => {
    const { server, transport } = await setupTest({ poolSize: 1 });

    try {
      // Populate the pool so that closeAllConnections() has a connection to
      // shut down.
      assert.ok((await transport.send(createTestMessage())).successful);

      // A shutdown that hands its slot back before the socket is gone would let
      // this send open a second connection alongside the closing one.
      const closing = transport.closeAllConnections();
      const sending = transport.send(createTestMessage());
      await closing;
      assert.ok((await sending).successful);

      assert.ok(
        server.getPeakConcurrentConnections() <= 1,
        `Expected at most 1 simultaneous connection, saw ${server.getPeakConcurrentConnections()}`,
      );
    } finally {
      await teardownTest(server, transport);
    }
  });

  test("rejects a poolSize that no connection could satisfy", () => {
    for (const poolSize of [0, -1, 2.5, Number.NaN]) {
      assert.throws(
        () =>
          new SmtpTransport({
            host: "localhost",
            port: 1025,
            secure: false,
            poolSize,
          }),
        RangeError,
        `Expected poolSize ${poolSize} to be rejected`,
      );
    }
  });

  test("accepts an unbounded poolSize", () => {
    const transport = new SmtpTransport({
      host: "localhost",
      port: 1025,
      secure: false,
      poolSize: Number.POSITIVE_INFINITY,
    });
    assert.strictEqual(transport.poolSize, Number.POSITIVE_INFINITY);
  });
});

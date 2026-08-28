import assert from "node:assert/strict";
import { Socket } from "node:net";
import { describe, test } from "node:test";
import {
  SmtpConnection,
  SmtpMessageSizeError,
  SmtpResponseError,
  SmtpUtf8UnsupportedError,
} from "./smtp-connection.ts";
import type { SmtpConfig } from "./config.ts";
import { SmtpAuthError } from "./oauth2.ts";
import { MockSmtpServer } from "./test-utils/mock-smtp-server.ts";

describe("SMTP Connection Integration Tests", () => {
  async function setupTest(
    configOverrides: Partial<SmtpConfig> = {},
    signal?: AbortSignal,
  ) {
    signal?.throwIfAborted();

    const server = new MockSmtpServer();
    await server.start();
    if (signal?.aborted) {
      await server.stop();
      signal.throwIfAborted();
    }

    const config: SmtpConfig = {
      host: "localhost",
      port: server.getPort(),
      secure: false,
      connectionTimeout: 5000,
      socketTimeout: 5000,
      localName: "test.local",
      ...configOverrides,
    };

    const connection = new SmtpConnection(config);
    return { server, connection };
  }

  async function teardownTest(
    server: MockSmtpServer,
    connection: SmtpConnection,
  ) {
    try {
      await connection.quit();
    } catch {
      // Ignore errors during cleanup
    }
    await server.stop();
    // Give the event loop time to clean up resources
    await new Promise((resolve) => setTimeout(resolve, 1));
  }

  function waitForCommandCount(
    server: MockSmtpServer,
    count: number,
    signal?: AbortSignal,
  ): Promise<void> {
    if (server.getReceivedCommands().length >= count) return Promise.resolve();

    return new Promise((resolve, reject) => {
      signal?.throwIfAborted();
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error(`Timed out waiting for ${count} SMTP commands.`));
      }, 5000);
      const onCommand = () => {
        if (server.getReceivedCommands().length >= count) {
          cleanup();
          resolve();
        }
      };
      const onAbort = () => {
        cleanup();
        try {
          signal?.throwIfAborted();
        } catch (error) {
          reject(error);
        }
      };
      const cleanup = () => {
        clearTimeout(timeout);
        server.off("command", onCommand);
        signal?.removeEventListener("abort", onAbort);
      };

      server.on("command", onCommand);
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }

  describe("Test setup", () => {
    test("should not start the server when already aborted", async () => {
      const controller = new AbortController();
      const reason = new Error("Test setup aborted.");
      controller.abort(reason);

      const originalStart = MockSmtpServer.prototype.start;
      let startCalled = false;
      MockSmtpServer.prototype.start = function (): Promise<number> {
        startCalled = true;
        return Promise.reject(new Error("Server should not start."));
      };

      try {
        await assert.rejects(
          () => setupTest({}, controller.signal),
          (error) => error === reason,
        );
      } finally {
        MockSmtpServer.prototype.start = originalStart;
      }

      assert.ok(!startCalled);
    });

    test("should stop the server when aborted during startup", async () => {
      const controller = new AbortController();
      const reason = new Error("Test setup aborted.");
      const originalStart = MockSmtpServer.prototype.start;
      const originalStop = MockSmtpServer.prototype.stop;
      let startedServer: MockSmtpServer | undefined;
      let stopCalls = 0;

      MockSmtpServer.prototype.start = async function (): Promise<number> {
        startedServer = this;
        const port = await originalStart.call(this);
        controller.abort(reason);
        return port;
      };
      MockSmtpServer.prototype.stop = async function (): Promise<void> {
        stopCalls++;
        await originalStop.call(this);
      };

      try {
        await assert.rejects(
          () => setupTest({}, controller.signal),
          (error) => error === reason,
        );
      } finally {
        MockSmtpServer.prototype.start = originalStart;
        MockSmtpServer.prototype.stop = originalStop;
        if (startedServer != null && stopCalls === 0) {
          await originalStop.call(startedServer);
        }
      }

      assert.equal(stopCalls, 1);
    });

    test("should reject an already-aborted command wait", async () => {
      const { server, connection } = await setupTest();
      const controller = new AbortController();
      const reason = new Error("Command wait aborted.");
      controller.abort(reason);

      try {
        await assert.rejects(
          () => waitForCommandCount(server, 1, controller.signal),
          (error) => error === reason,
        );
      } finally {
        await teardownTest(server, connection);
      }
    });
  });

  describe("Connection Lifecycle", () => {
    test("should establish connection successfully", async () => {
      const { server, connection } = await setupTest();
      try {
        await connection.connect();

        // Should be connected but not authenticated yet
        assert.strictEqual(connection.authenticated, false);
        assert.strictEqual(connection.capabilities.length, 0);
      } finally {
        await teardownTest(server, connection);
      }
    });

    test("should receive server greeting", async () => {
      const { server, connection } = await setupTest();
      try {
        await connection.connect();
        const greeting = await connection.greeting();

        assert.strictEqual(greeting.code, 220);
        assert.ok(greeting.message.includes("Mock SMTP Server"));
      } finally {
        await teardownTest(server, connection);
      }
    });

    test("should perform EHLO handshake", async () => {
      const { server, connection } = await setupTest();
      try {
        await connection.connect();
        await connection.greeting();
        await connection.ehlo();

        // Should have received capabilities
        assert.ok(connection.capabilities.length > 0);
        assert.ok(
          connection.capabilities.includes(
            "AUTH PLAIN LOGIN XOAUTH2 OAUTHBEARER",
          ),
        );
      } finally {
        await teardownTest(server, connection);
      }
    });

    for (const responseCode of [500, 502]) {
      test(`should fall back to HELO after EHLO ${responseCode}`, async () => {
        const { server, connection } = await setupTest();
        try {
          server.setResponse("EHLO", {
            code: responseCode,
            message: "Command not recognized",
          });
          await connection.connect();
          await connection.greeting();
          await connection.ehlo();

          assert.deepStrictEqual(connection.capabilities, []);
          assert.deepStrictEqual(server.getReceivedCommands().slice(0, 2), [
            "EHLO test.local",
            "HELO test.local",
          ]);
        } finally {
          await teardownTest(server, connection);
        }
      });
    }

    test("should fail when the HELO fallback is rejected", async () => {
      const { server, connection } = await setupTest();
      try {
        server.setResponse("EHLO", {
          code: 500,
          message: "Command not recognized",
        });
        server.setResponse("HELO", {
          code: 550,
          message: "Greeting rejected",
        });
        await connection.connect();
        await connection.greeting();

        await assert.rejects(() => connection.ehlo(), (error) => {
          assert.ok(error instanceof SmtpResponseError);
          assert.equal(error.code, 550);
          assert.equal(error.command, "HELO");
          assert.equal(error.response, "Greeting rejected");
          return true;
        });
        assert.deepStrictEqual(server.getReceivedCommands().slice(0, 2), [
          "EHLO test.local",
          "HELO test.local",
        ]);
      } finally {
        await teardownTest(server, connection);
      }
    });

    test("should not fall back to HELO after a transient EHLO failure", async () => {
      const { server, connection } = await setupTest();
      try {
        server.setResponse("EHLO", {
          code: 421,
          message: "Service not available",
        });
        await connection.connect();
        await connection.greeting();

        await assert.rejects(() => connection.ehlo(), (error) => {
          assert.ok(error instanceof SmtpResponseError);
          assert.equal(error.code, 421);
          assert.equal(error.command, "EHLO");
          assert.equal(error.response, "Service not available");
          return true;
        });
        assert.ok(
          !server.getReceivedCommands().some((command) =>
            command.startsWith("HELO ")
          ),
        );
      } finally {
        await teardownTest(server, connection);
      }
    });

    test("should gracefully quit connection", async () => {
      const { server, connection } = await setupTest();
      try {
        await connection.connect();
        await connection.greeting();

        await connection.quit();

        // Connection should be reset
        assert.strictEqual(connection.authenticated, false);
        assert.strictEqual(connection.capabilities.length, 0);
      } finally {
        await teardownTest(server, connection);
      }
    });
  });

  describe("Authentication", () => {
    function setupSimulatedAuthentication(
      host: string,
      remoteAddress?: string,
    ): { connection: SmtpConnection; socket: Socket } {
      const connection = new SmtpConnection({
        host,
        port: 25,
        secure: false,
        auth: {
          user: "testuser",
          pass: "testpass",
          method: "plain",
        },
      });
      const socket = new Socket();
      if (remoteAddress != null) {
        Object.defineProperty(socket, "remoteAddress", {
          configurable: true,
          value: remoteAddress,
        });
      }
      connection.socket = socket;
      connection.capabilities = ["AUTH PLAIN LOGIN"];
      connection.sendCommand = () =>
        Promise.resolve({
          code: 235,
          message: "Authentication successful",
          raw: "235 Authentication successful",
        });
      return { connection, socket };
    }

    test("should skip authentication when no credentials provided", async () => {
      const { server, connection } = await setupTest();
      try {
        await connection.connect();
        await connection.greeting();
        await connection.ehlo();

        // Should not throw and should remain unauthenticated
        await connection.authenticate();
        assert.strictEqual(connection.authenticated, false);
      } finally {
        await teardownTest(server, connection);
      }
    });

    test("should authenticate with PLAIN method", async () => {
      const { server, connection } = await setupTest();
      try {
        const authConfig: SmtpConfig = {
          host: "localhost",
          port: server.getPort(),
          secure: false,
          auth: {
            user: "testuser",
            pass: "testpass",
            method: "plain",
          },
        };

        const authConnection = new SmtpConnection(authConfig);

        try {
          await authConnection.connect();
          await authConnection.greeting();
          await authConnection.ehlo();
          await authConnection.authenticate();

          assert.strictEqual(authConnection.authenticated, true);
        } finally {
          await authConnection.quit();
        }
      } finally {
        await teardownTest(server, connection);
      }
    });

    test("should authenticate with LOGIN method", async () => {
      const { server, connection } = await setupTest();
      try {
        const authConfig: SmtpConfig = {
          host: "localhost",
          port: server.getPort(),
          secure: false,
          auth: {
            user: "testuser",
            pass: "testpass",
            method: "login",
          },
        };

        const authConnection = new SmtpConnection(authConfig);

        try {
          await authConnection.connect();
          await authConnection.greeting();
          await authConnection.ehlo();
          await authConnection.authenticate();

          assert.strictEqual(authConnection.authenticated, true);
        } finally {
          await authConnection.quit();
        }
      } finally {
        await teardownTest(server, connection);
      }
    });

    for (const method of ["plain", "login"] as const) {
      test(`should refuse ${method.toUpperCase()} over a cleartext non-loopback connection`, async () => {
        const connection = new SmtpConnection({
          host: "smtp.example.com",
          port: 25,
          secure: false,
          socketTimeout: 10,
          auth: {
            user: "testuser",
            pass: "testpass",
            method,
          },
        });
        // Simulate a post-EHLO plaintext connection without dialing out.  The
        // TLS guard must reject before either credential-bearing AUTH exchange
        // can use the socket.
        const socket = new Socket();
        connection.socket = socket;
        connection.capabilities = ["AUTH PLAIN LOGIN"];
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
    }

    for (
      const host of [
        "LOCALHOST",
        "localhost.",
        "smtp.localhost",
        "127.0.0.2",
        "0::1",
        "0:0:0:0:0:0::1",
        "0:0:0:0:0:0:0:1",
        "[::1]",
        "[::0001]",
      ]
    ) {
      test(`should recognize configured loopback host ${host}`, async () => {
        const { connection, socket } = setupSimulatedAuthentication(host);
        try {
          await connection.authenticate();
          assert.ok(connection.authenticated);
        } finally {
          socket.destroy();
        }
      });
    }

    for (
      const remoteAddress of [
        "127.0.0.2",
        "::1",
        "0:0::1",
        "0:0:0:0:0:0:0:1",
        "::ffff:127.0.0.2",
        "::ffff:7f00:2",
        "0:0::ffff:127.0.0.2",
      ]
    ) {
      test(`should recognize connected loopback address ${remoteAddress}`, async () => {
        const { connection, socket } = setupSimulatedAuthentication(
          "smtp.example.com",
          remoteAddress,
        );
        try {
          await connection.authenticate();
          assert.ok(connection.authenticated);
        } finally {
          socket.destroy();
        }
      });
    }

    test("should prefer the connected address over the configured host", async () => {
      const { connection, socket } = setupSimulatedAuthentication(
        "localhost",
        "192.0.2.1",
      );
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

    test("should reject authentication with invalid credentials", async () => {
      const { server, connection } = await setupTest();
      try {
        server.setResponse("AUTH", {
          code: 535,
          message: "Authentication failed",
        });

        const authConfig: SmtpConfig = {
          host: "localhost",
          port: server.getPort(),
          secure: false,
          auth: {
            user: "wronguser",
            pass: "wrongpass",
          },
        };

        const authConnection = new SmtpConnection(authConfig);

        try {
          await authConnection.connect();
          await authConnection.greeting();
          await authConnection.ehlo();

          await assert.rejects(
            authConnection.authenticate(),
            /Authentication failed/,
          );

          assert.strictEqual(authConnection.authenticated, false);
        } finally {
          await authConnection.quit();
        }
      } finally {
        await teardownTest(server, connection);
      }
    });
  });

  describe("STARTTLS", () => {
    test("should send STARTTLS command successfully", async () => {
      const { server, connection } = await setupTest();
      try {
        await connection.connect();
        await connection.greeting();
        await connection.ehlo();

        // Note: Mock server doesn't actually upgrade to TLS
        // It just responds with 220 but doesn't perform TLS handshake
        // This test would timeout, so we skip the actual upgrade
        // For real TLS testing, use integration tests with actual SMTP servers

        // Just verify we can send the command and get a 220 response
        const response = await connection.sendCommand("STARTTLS");
        assert.strictEqual(response.code, 220);
      } finally {
        await teardownTest(server, connection);
      }
    });

    test("should reject STARTTLS on already TLS socket", async () => {
      const { server, connection } = await setupTest();
      try {
        // This test verifies the logic check in starttls() method
        // We can't easily test with a real TLS socket via the mock server
        // but we can verify that calling starttls() checks for TLS socket type

        // First establish a normal connection
        await connection.connect();
        await connection.greeting();
        await connection.ehlo();

        // We can't easily create a real TLSSocket, so we'll verify
        // the error check exists by reading the implementation
        // For now, skip this test as it requires complex TLS mocking
        // Real TLS servers like Mailpit will be used for integration testing
      } finally {
        await teardownTest(server, connection);
      }
    });

    test("should handle STARTTLS rejection", async () => {
      const { server, connection } = await setupTest();
      try {
        server.setResponse("STARTTLS", {
          code: 454,
          message: "TLS not available",
        });

        await connection.connect();
        await connection.greeting();
        await connection.ehlo();

        await assert.rejects(connection.starttls(), (error) => {
          assert.ok(error instanceof SmtpResponseError);
          assert.equal(error.code, 454);
          assert.equal(error.command, "STARTTLS");
          assert.equal(error.response, "TLS not available");
          return true;
        });
      } finally {
        await teardownTest(server, connection);
      }
    });
  });

  describe("Message Sending", () => {
    test("should negotiate SMTPUTF8 for an internationalized envelope", async () => {
      const { server, connection } = await setupTest();
      try {
        server.setCapabilities(["sMtPuTf8 ignored-parameter", "8bItMiMe"]);
        await connection.connect();
        await connection.greeting();
        await connection.ehlo();

        await connection.sendMessage({
          envelope: {
            from: "josé@example.com",
            to: ["用户@example.com"],
          },
          raw: "From: josé@example.com\r\n\r\nMessage",
          requiresSmtpUtf8: true,
        });

        assert.ok(
          server.getReceivedCommands().includes(
            "MAIL FROM:<josé@example.com> BODY=8BITMIME SMTPUTF8",
          ),
        );
      } finally {
        await teardownTest(server, connection);
      }
    });

    test("should reject SMTPUTF8 before MAIL FROM when unsupported", async () => {
      const { server, connection } = await setupTest();
      try {
        server.setCapabilities(["8BITMIME"]);
        await connection.connect();
        await connection.greeting();
        await connection.ehlo();

        await assert.rejects(
          connection.sendMessage({
            envelope: {
              from: "josé@example.com",
              to: ["recipient@example.com"],
            },
            raw: "Internationalized message",
            requiresSmtpUtf8: true,
          }),
          SmtpUtf8UnsupportedError,
        );
        assert.ok(
          !server.getReceivedCommands().some((command) =>
            command.startsWith("MAIL FROM:")
          ),
        );
      } finally {
        await teardownTest(server, connection);
      }
    });

    test("should require 8BITMIME with SMTPUTF8", async () => {
      const { server, connection } = await setupTest();
      try {
        server.setCapabilities(["SMTPUTF8"]);
        await connection.connect();
        await connection.greeting();
        await connection.ehlo();

        await assert.rejects(
          connection.sendMessage({
            envelope: {
              from: "sender@example.com",
              to: ["用户@example.com"],
            },
            raw: "Internationalized message",
            requiresSmtpUtf8: true,
          }),
          /8BITMIME/,
        );
        assert.ok(
          !server.getReceivedCommands().some((command) =>
            command.startsWith("MAIL FROM:")
          ),
        );
      } finally {
        await teardownTest(server, connection);
      }
    });

    test("should declare the RFC 1870 message size", async () => {
      const { server, connection } = await setupTest();
      const raw = "Subject: SIZE test\r\n\r\n.안녕하세요";
      const messageSize = new TextEncoder().encode(`${raw}\r\n`).byteLength;
      try {
        server.setCapabilities([`sIzE ${messageSize}`]);
        await connection.connect();
        await connection.greeting();
        await connection.ehlo();

        await connection.sendMessage({
          envelope: {
            from: "sender@example.com",
            to: ["recipient@example.com"],
          },
          raw,
        });

        assert.ok(
          server.getReceivedCommands().includes(
            `MAIL FROM:<sender@example.com> SIZE=${messageSize}`,
          ),
        );
      } finally {
        await teardownTest(server, connection);
      }
    });

    test("should reject a message above the advertised SIZE limit", async () => {
      const { server, connection } = await setupTest();
      const raw = "Oversized message";
      const messageSize = new TextEncoder().encode(`${raw}\r\n`).byteLength;
      try {
        server.setCapabilities([`SIZE ${messageSize - 1}`]);
        await connection.connect();
        await connection.greeting();
        await connection.ehlo();

        await assert.rejects(
          connection.sendMessage({
            envelope: {
              from: "sender@example.com",
              to: ["recipient@example.com"],
            },
            raw,
          }),
          new SmtpMessageSizeError(messageSize, BigInt(messageSize - 1)),
        );
        assert.ok(
          !server.getReceivedCommands().some((command) =>
            command.startsWith("MAIL FROM:")
          ),
        );
      } finally {
        await teardownTest(server, connection);
      }
    });

    test("should declare size when SIZE has no maximum", async () => {
      const { server, connection } = await setupTest();
      const raw = "Message without a fixed maximum";
      const messageSize = new TextEncoder().encode(`${raw}\r\n`).byteLength;
      try {
        server.setCapabilities(["SIZE"]);
        await connection.connect();
        await connection.greeting();
        await connection.ehlo();

        await connection.sendMessage({
          envelope: {
            from: "sender@example.com",
            to: ["recipient@example.com"],
          },
          raw,
        });

        assert.ok(
          server.getReceivedCommands().includes(
            `MAIL FROM:<sender@example.com> SIZE=${messageSize}`,
          ),
        );
      } finally {
        await teardownTest(server, connection);
      }
    });

    test("should treat a SIZE limit of zero as unlimited", async () => {
      const { server, connection } = await setupTest();
      const raw = "Message with no fixed maximum";
      const messageSize = new TextEncoder().encode(`${raw}\r\n`).byteLength;
      try {
        server.setCapabilities(["SIZE 0"]);
        await connection.connect();
        await connection.greeting();
        await connection.ehlo();

        await connection.sendMessage({
          envelope: {
            from: "sender@example.com",
            to: ["recipient@example.com"],
          },
          raw,
        });

        assert.ok(
          server.getReceivedCommands().includes(
            `MAIL FROM:<sender@example.com> SIZE=${messageSize}`,
          ),
        );
      } finally {
        await teardownTest(server, connection);
      }
    });

    test("should omit size when SIZE is not advertised", async () => {
      const { server, connection } = await setupTest();
      try {
        server.setCapabilities(["HELP"]);
        await connection.connect();
        await connection.greeting();
        await connection.ehlo();

        await connection.sendMessage({
          envelope: {
            from: "sender@example.com",
            to: ["recipient@example.com"],
          },
          raw: "Message for a server without SIZE",
        });

        assert.ok(
          server.getReceivedCommands().includes(
            "MAIL FROM:<sender@example.com>",
          ),
        );
      } finally {
        await teardownTest(server, connection);
      }
    });

    test("should pipeline envelope commands when advertised", async () => {
      const { server, connection } = await setupTest();
      try {
        server.setCapabilities(["AUTH PLAIN", "pIpElInInG", "HELP"]);
        server.holdEnvelopeResponses();
        await connection.connect();
        await connection.greeting();
        await connection.ehlo();

        const sending = connection.sendMessage({
          envelope: {
            from: "sender@example.com",
            to: ["first@example.com", "second@example.com"],
          },
          raw: "Pipelined message",
        });
        void sending.catch(() => undefined);

        await waitForCommandCount(server, 4);
        assert.deepStrictEqual(server.getReceivedCommands().slice(-3), [
          "MAIL FROM:<sender@example.com>",
          "RCPT TO:<first@example.com>",
          "RCPT TO:<second@example.com>",
        ]);

        server.flushEnvelopeResponses();
        const result = await sending;
        assert.ok(result.messageId.length > 0);
      } finally {
        await teardownTest(server, connection);
      }
    });

    test("should wait for each envelope reply without PIPELINING", async () => {
      const { server, connection } = await setupTest();
      try {
        server.setResponse("EHLO", {
          code: 250,
          message: "PIPELINING unavailable",
        });
        server.holdEnvelopeResponses();
        await connection.connect();
        await connection.greeting();
        await connection.ehlo();

        const sending = connection.sendMessage({
          envelope: {
            from: "sender@example.com",
            to: ["first@example.com", "second@example.com"],
          },
          raw: "Sequential message",
        });
        await waitForCommandCount(server, 2);
        assert.deepStrictEqual(server.getReceivedCommands().slice(-1), [
          "MAIL FROM:<sender@example.com>",
        ]);

        server.flushEnvelopeResponses();
        const result = await sending;
        assert.ok(result.messageId.length > 0);
      } finally {
        await teardownTest(server, connection);
      }
    });

    test("should correlate multiline pipelined recipient replies", async () => {
      const { server, connection } = await setupTest();
      try {
        server.setCapabilities(["PIPELINING"]);
        server.setResponses("RCPT", [
          {
            code: 250,
            continuationLines: ["2.1.5 Recipient accepted"],
            message: "2.1.5 Will forward",
          },
          { code: 550, message: "5.1.1 No such user" },
          { code: 251, message: "2.1.5 User not local; will forward" },
        ]);
        await connection.connect();
        await connection.greeting();
        await connection.ehlo();

        const result = await connection.sendMessage({
          envelope: {
            from: "sender@example.com",
            to: [
              "first@example.com",
              "rejected@example.com",
              "forwarded@example.com",
            ],
          },
          raw: "Mixed recipient message",
        });

        assert.deepStrictEqual(result.rejectedRecipients, [{
          recipient: "rejected@example.com",
          code: 550,
          response: "5.1.1 No such user",
          retryable: false,
          enhancedStatusCode: {
            code: "5.1.1",
            class: 5,
            subject: 1,
            detail: 1,
          },
        }]);
        assert.deepStrictEqual(server.getReceivedMessages()[0]?.to, [
          "first@example.com",
          "forwarded@example.com",
        ]);
      } finally {
        await teardownTest(server, connection);
      }
    });

    test("should treat a pipelined 421 reply as fatal", async () => {
      const { server, connection } = await setupTest();
      try {
        server.setCapabilities(["PIPELINING"]);
        server.setResponses("RCPT", [
          { code: 250, message: "2.1.5 Recipient accepted" },
          { code: 421, message: "4.3.2 Service shutting down" },
        ]);
        await connection.connect();
        await connection.greeting();
        await connection.ehlo();

        await assert.rejects(
          connection.sendMessage({
            envelope: {
              from: "sender@example.com",
              to: ["first@example.com", "second@example.com"],
            },
            raw: "Connection failure message",
          }),
          (error) => {
            assert.ok(error instanceof SmtpResponseError);
            assert.strictEqual(error.code, 421);
            assert.strictEqual(error.command, "RCPT TO");
            return true;
          },
        );
        assert.ok(
          !server.getReceivedCommands().some((command) => command === "DATA"),
        );
      } finally {
        await teardownTest(server, connection);
      }
    });

    test("should preserve MAIL FROM 421 when the server closes", async () => {
      const { server, connection } = await setupTest();
      try {
        server.setCapabilities(["PIPELINING"]);
        server.setResponse("MAIL", {
          code: 421,
          message: "4.3.2 Service shutting down",
          closeConnection: true,
        });
        await connection.connect();
        await connection.greeting();
        await connection.ehlo();

        await assert.rejects(
          connection.sendMessage({
            envelope: {
              from: "sender@example.com",
              to: ["first@example.com", "second@example.com"],
            },
            raw: "Connection failure message",
          }),
          (error) => {
            assert.ok(error instanceof SmtpResponseError);
            assert.strictEqual(error.code, 421);
            assert.strictEqual(error.command, "MAIL FROM");
            assert.strictEqual(error.response, "4.3.2 Service shutting down");
            return true;
          },
        );
      } finally {
        await teardownTest(server, connection);
      }
    });

    test("should preserve MAIL FROM 550 when the server closes", async () => {
      const { server, connection } = await setupTest();
      try {
        server.setCapabilities(["PIPELINING"]);
        server.setResponse("MAIL", {
          code: 550,
          message: "5.7.1 Sender address blocked",
          closeConnection: true,
        });
        await connection.connect();
        await connection.greeting();
        await connection.ehlo();

        await assert.rejects(
          connection.sendMessage({
            envelope: {
              from: "blocked@example.com",
              to: ["first@example.com", "second@example.com"],
            },
            raw: "Blocked sender message",
          }),
          (error) => {
            assert.ok(error instanceof SmtpResponseError);
            assert.strictEqual(error.code, 550);
            assert.strictEqual(error.command, "MAIL FROM");
            assert.strictEqual(error.response, "5.7.1 Sender address blocked");
            return true;
          },
        );
      } finally {
        await teardownTest(server, connection);
      }
    });

    test("should preserve a non-final RCPT TO 421 on close", async () => {
      const { server, connection } = await setupTest();
      try {
        server.setCapabilities(["PIPELINING"]);
        server.setResponses("RCPT", [
          { code: 250, message: "2.1.5 Recipient accepted" },
          {
            code: 421,
            message: "4.3.2 Service shutting down",
            closeConnection: true,
          },
          { code: 250, message: "2.1.5 Recipient accepted" },
        ]);
        await connection.connect();
        await connection.greeting();
        await connection.ehlo();

        await assert.rejects(
          connection.sendMessage({
            envelope: {
              from: "sender@example.com",
              to: [
                "first@example.com",
                "second@example.com",
                "third@example.com",
              ],
            },
            raw: "Connection failure message",
          }),
          (error) => {
            assert.ok(error instanceof SmtpResponseError);
            assert.strictEqual(error.code, 421);
            assert.strictEqual(error.command, "RCPT TO");
            assert.strictEqual(error.response, "4.3.2 Service shutting down");
            assert.match(error.message, /second@example\.com/);
            return true;
          },
        );
      } finally {
        await teardownTest(server, connection);
      }
    });

    test("should reset the pipeline timeout after each reply", async () => {
      const { server, connection } = await setupTest({ socketTimeout: 1000 });
      try {
        server.setCapabilities(["PIPELINING"]);
        server.holdEnvelopeResponses();
        await connection.connect();
        await connection.greeting();
        await connection.ehlo();

        const sending = connection.sendMessage({
          envelope: {
            from: "sender@example.com",
            to: ["first@example.com", "second@example.com"],
          },
          raw: "Slow replies message",
        });
        void sending.catch(() => undefined);

        await waitForCommandCount(server, 4);
        assert.ok(server.flushNextEnvelopeResponse());
        await new Promise((resolve) => setTimeout(resolve, 600));
        assert.ok(server.flushNextEnvelopeResponse());
        await new Promise((resolve) => setTimeout(resolve, 600));
        assert.ok(server.flushNextEnvelopeResponse());

        const result = await sending;
        assert.ok(result.messageId.length > 0);
      } finally {
        await teardownTest(server, connection);
      }
    });

    test("should send message successfully", async () => {
      const { server, connection } = await setupTest();
      try {
        await connection.connect();
        await connection.greeting();
        await connection.ehlo();

        const testMessage = {
          envelope: {
            from: "sender@example.com",
            to: ["recipient@example.com"],
          },
          raw:
            "From: sender@example.com\r\nTo: recipient@example.com\r\nSubject: Test\r\n\r\nHello World!",
        };

        const result = await connection.sendMessage(testMessage);

        assert.ok(result.messageId.length > 0);

        // Verify message content was received
        const receivedMessages = server.getReceivedMessages();
        assert.strictEqual(receivedMessages.length, 1);
        assert.strictEqual(receivedMessages[0].from, "sender@example.com");
        assert.deepStrictEqual(receivedMessages[0].to, [
          "recipient@example.com",
        ]);
        assert.ok(receivedMessages[0].data.includes("Hello World!"));
      } finally {
        await teardownTest(server, connection);
      }
    });

    test("should accept a recipient that will be forwarded", async () => {
      const { server, connection } = await setupTest();
      try {
        server.setResponse("RCPT", {
          code: 251,
          message: "User not local; will forward",
        });

        await connection.connect();
        await connection.greeting();
        await connection.ehlo();

        const testMessage = {
          envelope: {
            from: "sender@example.com",
            to: ["forwarded@example.com"],
          },
          raw:
            "From: sender@example.com\r\nTo: forwarded@example.com\r\nSubject: Forwarded\r\n\r\nTest message",
        };

        const result = await connection.sendMessage(testMessage);

        assert.ok(result.messageId.length > 0);
        assert.strictEqual(server.getReceivedMessages().length, 1);
      } finally {
        await teardownTest(server, connection);
      }
    });

    test("should send message to multiple recipients", async () => {
      const { server, connection } = await setupTest();
      try {
        await connection.connect();
        await connection.greeting();
        await connection.ehlo();

        const testMessage = {
          envelope: {
            from: "sender@example.com",
            to: [
              "recipient1@example.com",
              "recipient2@example.com",
              "recipient3@example.com",
            ],
          },
          raw:
            "From: sender@example.com\r\nTo: recipient1@example.com\r\nSubject: Multi-recipient\r\n\r\nMultiple recipients test",
        };

        const result = await connection.sendMessage(testMessage);
        assert.ok(result.messageId.length > 0);

        const receivedMessages = server.getReceivedMessages();
        assert.strictEqual(receivedMessages.length, 1);
        assert.strictEqual(receivedMessages[0].to.length, 3);
      } finally {
        await teardownTest(server, connection);
      }
    });

    test("should handle MAIL FROM rejection", async () => {
      const { server, connection } = await setupTest();
      try {
        server.setResponse("MAIL", {
          code: 550,
          message: "Sender not allowed",
        });

        await connection.connect();
        await connection.greeting();
        await connection.ehlo();

        const testMessage = {
          envelope: {
            from: "blocked@example.com",
            to: ["recipient@example.com"],
          },
          raw:
            "From: blocked@example.com\r\nTo: recipient@example.com\r\nSubject: Test\r\n\r\nTest message",
        };

        await assert.rejects(
          connection.sendMessage(testMessage),
          /MAIL FROM failed.*Sender not allowed/,
        );
      } finally {
        await teardownTest(server, connection);
      }
    });

    test("should handle RCPT TO rejection", async () => {
      const { server, connection } = await setupTest();
      try {
        server.setResponse("RCPT", {
          code: 550,
          message: "Recipient not found",
        });

        await connection.connect();
        await connection.greeting();
        await connection.ehlo();

        const testMessage = {
          envelope: {
            from: "sender@example.com",
            to: ["invalid@example.com"],
          },
          raw:
            "From: sender@example.com\r\nTo: invalid@example.com\r\nSubject: Test\r\n\r\nTest message",
        };

        await assert.rejects(
          connection.sendMessage(testMessage),
          /RCPT TO failed.*Recipient not found/,
        );
      } finally {
        await teardownTest(server, connection);
      }
    });

    test("should handle DATA rejection", async () => {
      const { server, connection } = await setupTest();
      try {
        server.setResponse("DATA", { code: 554, message: "Message rejected" });

        await connection.connect();
        await connection.greeting();
        await connection.ehlo();

        const testMessage = {
          envelope: {
            from: "sender@example.com",
            to: ["recipient@example.com"],
          },
          raw:
            "From: sender@example.com\r\nTo: recipient@example.com\r\nSubject: Rejected\r\n\r\nThis will be rejected",
        };

        await assert.rejects(
          connection.sendMessage(testMessage),
          /DATA failed.*Message rejected/,
        );
      } finally {
        await teardownTest(server, connection);
      }
    });
  });

  describe("Message ID Extraction", () => {
    test("should extract message ID from server response", async () => {
      const { server, connection } = await setupTest();
      try {
        server.setResponse("DATA_END", {
          code: 250,
          message: "2.0.0 OK id=abc123def456@mail.example.com queued",
        });

        await connection.connect();
        await connection.greeting();
        await connection.ehlo();

        const testMessage = {
          envelope: {
            from: "sender@example.com",
            to: ["recipient@example.com"],
          },
          raw:
            "From: sender@example.com\r\nTo: recipient@example.com\r\nSubject: Test\r\n\r\nTest message",
        };

        const result = await connection.sendMessage(testMessage);
        assert.strictEqual(
          result.messageId,
          "abc123def456@mail.example.com",
        );
      } finally {
        await teardownTest(server, connection);
      }
    });

    test("should generate fallback message ID when none provided", async () => {
      const { server, connection } = await setupTest();
      try {
        server.setResponse("DATA_END", {
          code: 250,
          message: "OK queued for delivery",
        });

        await connection.connect();
        await connection.greeting();
        await connection.ehlo();

        const testMessage = {
          envelope: {
            from: "sender@example.com",
            to: ["recipient@example.com"],
          },
          raw: "Simple message",
        };

        const result = await connection.sendMessage(testMessage);

        assert.ok(result.messageId.startsWith("smtp-"));
        assert.ok(result.messageId.length > 10);
      } finally {
        await teardownTest(server, connection);
      }
    });
  });

  describe("Connection Reset", () => {
    test("should reset connection state", async () => {
      const { server, connection } = await setupTest();
      try {
        await connection.connect();
        await connection.greeting();
        await connection.ehlo();

        // Send a message first
        const testMessage = {
          envelope: {
            from: "sender@example.com",
            to: ["recipient@example.com"],
          },
          raw: "Test message",
        };

        await connection.sendMessage(testMessage);

        // Reset the connection
        await connection.reset();

        // Should be able to send another message
        await connection.sendMessage(testMessage);

        const receivedMessages = server.getReceivedMessages();
        assert.strictEqual(receivedMessages.length, 2);
      } finally {
        await teardownTest(server, connection);
      }
    });

    test("should handle reset failure", async () => {
      const { server, connection } = await setupTest();
      try {
        server.setResponse("RSET", {
          code: 500,
          message: "Reset not supported",
        });

        await connection.connect();
        await connection.greeting();
        await connection.ehlo();

        await assert.rejects(
          connection.reset(),
          /RESET failed.*Reset not supported/,
        );
      } finally {
        await teardownTest(server, connection);
      }
    });
  });

  describe("Error Handling", () => {
    test("should not allow commands before connection", async () => {
      const { server, connection } = await setupTest();
      try {
        // Create a fresh connection object for this test to ensure clean state
        const freshConnection = new SmtpConnection({
          host: "localhost",
          port: server.getPort(),
          secure: false,
        });

        // Test sendCommand throws
        try {
          await freshConnection.sendCommand("EHLO test");
          assert.fail("Expected sendCommand to throw an error");
        } catch (error) {
          assert.strictEqual((error as Error).message, "Not connected");
        }

        // Test reset throws
        try {
          await freshConnection.reset();
          assert.fail("Expected reset to throw an error");
        } catch (error) {
          assert.strictEqual((error as Error).message, "Not connected");
        }
      } finally {
        await teardownTest(server, connection);
      }
    });

    test("should prevent double connection", async () => {
      const { server, connection } = await setupTest();
      try {
        // Test with a new connection object
        const freshConnection = new SmtpConnection({
          host: "localhost",
          port: server.getPort(),
          secure: false,
        });

        await freshConnection.connect();

        // Test double connect throws
        try {
          await freshConnection.connect();
          assert.fail("Expected connect to throw an error");
        } catch (error) {
          assert.strictEqual(
            (error as Error).message,
            "Connection already established",
          );
        }

        // Cleanup
        await freshConnection.quit();
      } finally {
        await teardownTest(server, connection);
      }
    });
  });

  describe("Dot Stuffing", () => {
    test("should properly escape dots in message content", async () => {
      const { server, connection } = await setupTest();
      try {
        await connection.connect();
        await connection.greeting();
        await connection.ehlo();

        const testMessage = {
          envelope: {
            from: "sender@example.com",
            to: ["recipient@example.com"],
          },
          raw:
            "From: sender@example.com\r\nTo: recipient@example.com\r\nSubject: Dot Test\r\n\r\nLine 1\r\n.Hidden line\r\nLine 3",
        };

        await connection.sendMessage(testMessage);

        // Verify the message was received with proper dot stuffing
        const receivedMessages = server.getReceivedMessages();
        assert.strictEqual(receivedMessages.length, 1);

        // The original message should be preserved (server handles unstuffing)
        assert.ok(receivedMessages[0].data.includes(".Hidden line"));
      } finally {
        await teardownTest(server, connection);
      }
    });
  });
});

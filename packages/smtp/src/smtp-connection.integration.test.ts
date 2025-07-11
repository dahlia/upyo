import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { SmtpConnection } from "./smtp-connection.ts";
import type { SmtpConfig } from "./config.ts";
import { MockSmtpServer } from "./test-utils/mock-smtp-server.ts";

describe("SMTP Connection Integration Tests", () => {
  async function setupTest() {
    const server = new MockSmtpServer();
    await server.start();

    const config: SmtpConfig = {
      host: "localhost",
      port: server.getPort(),
      secure: false,
      connectionTimeout: 5000,
      socketTimeout: 5000,
      localName: "test.local",
    };

    const connection = new SmtpConnection(config);
    return { server, connection };
  }

  async function teardownTest(server: MockSmtpServer, connection: SmtpConnection) {
    try {
      await connection.quit();
    } catch {
      // Ignore errors during cleanup
    }
    await server.stop();
    // Give the event loop time to clean up resources
    await new Promise(resolve => setTimeout(resolve, 1));
  }

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
        assert.ok(connection.capabilities.includes("AUTH PLAIN LOGIN"));
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

    test("should reject authentication with invalid credentials", async () => {
      const { server, connection } = await setupTest();
      try {
        server.setResponse("AUTH", { code: 535, message: "Authentication failed" });
        
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
            /Authentication failed/
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

  describe("Message Sending", () => {
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
          raw: "From: sender@example.com\r\nTo: recipient@example.com\r\nSubject: Test\r\n\r\nHello World!",
        };
        
        const messageId = await connection.sendMessage(testMessage);
        
        assert.ok(messageId.length > 0);
        
        // Verify message content was received
        const receivedMessages = server.getReceivedMessages();
        assert.strictEqual(receivedMessages.length, 1);
        assert.strictEqual(receivedMessages[0].from, "sender@example.com");
        assert.deepStrictEqual(receivedMessages[0].to, ["recipient@example.com"]);
        assert.ok(receivedMessages[0].data.includes("Hello World!"));
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
            to: ["recipient1@example.com", "recipient2@example.com", "recipient3@example.com"],
          },
          raw: "From: sender@example.com\r\nTo: recipient1@example.com\r\nSubject: Multi-recipient\r\n\r\nMultiple recipients test",
        };
        
        const messageId = await connection.sendMessage(testMessage);
        assert.ok(messageId.length > 0);
        
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
        server.setResponse("MAIL", { code: 550, message: "Sender not allowed" });
        
        await connection.connect();
        await connection.greeting();
        await connection.ehlo();
        
        const testMessage = {
          envelope: {
            from: "blocked@example.com",
            to: ["recipient@example.com"],
          },
          raw: "From: blocked@example.com\r\nTo: recipient@example.com\r\nSubject: Test\r\n\r\nTest message",
        };
        
        await assert.rejects(
          connection.sendMessage(testMessage),
          /MAIL FROM failed.*Sender not allowed/
        );
      } finally {
        await teardownTest(server, connection);
      }
    });

    test("should handle RCPT TO rejection", async () => {
      const { server, connection } = await setupTest();
      try {
        server.setResponse("RCPT", { code: 550, message: "Recipient not found" });
        
        await connection.connect();
        await connection.greeting();
        await connection.ehlo();
        
        const testMessage = {
          envelope: {
            from: "sender@example.com",
            to: ["invalid@example.com"],
          },
          raw: "From: sender@example.com\r\nTo: invalid@example.com\r\nSubject: Test\r\n\r\nTest message",
        };
        
        await assert.rejects(
          connection.sendMessage(testMessage),
          /RCPT TO failed.*Recipient not found/
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
          raw: "From: sender@example.com\r\nTo: recipient@example.com\r\nSubject: Rejected\r\n\r\nThis will be rejected",
        };
        
        await assert.rejects(
          connection.sendMessage(testMessage),
          /DATA failed.*Message rejected/
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
          message: "2.0.0 OK id=abc123def456@mail.example.com queued" 
        });
        
        await connection.connect();
        await connection.greeting();
        await connection.ehlo();
        
        const testMessage = {
          envelope: {
            from: "sender@example.com",
            to: ["recipient@example.com"],
          },
          raw: "From: sender@example.com\r\nTo: recipient@example.com\r\nSubject: Test\r\n\r\nTest message",
        };
        
        const messageId = await connection.sendMessage(testMessage);
        assert.strictEqual(messageId, "abc123def456@mail.example.com");
      } finally {
        await teardownTest(server, connection);
      }
    });

    test("should generate fallback message ID when none provided", async () => {
      const { server, connection } = await setupTest();
      try {
        server.setResponse("DATA_END", { 
          code: 250, 
          message: "OK queued for delivery" 
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
        
        const messageId = await connection.sendMessage(testMessage);
        
        assert.ok(messageId.startsWith("smtp-"));
        assert.ok(messageId.length > 10);
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
        server.setResponse("RSET", { code: 500, message: "Reset not supported" });
        
        await connection.connect();
        await connection.greeting();
        await connection.ehlo();
        
        await assert.rejects(
          connection.reset(),
          /RESET failed.*Reset not supported/
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
        
        await assert.rejects(
          async () => freshConnection.sendCommand("EHLO test"),
          {
            name: 'Error',
            message: 'Not connected'
          }
        );
        
        await assert.rejects(
          async () => freshConnection.reset(),
          {
            name: 'Error', 
            message: 'Not connected'
          }
        );
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
        
        await assert.rejects(
          async () => freshConnection.connect(),
          {
            name: 'Error',
            message: 'Connection already established'
          }
        );
        
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
          raw: "From: sender@example.com\r\nTo: recipient@example.com\r\nSubject: Dot Test\r\n\r\nLine 1\r\n.Hidden line\r\nLine 3",
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
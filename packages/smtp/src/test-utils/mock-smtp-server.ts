import { EventEmitter } from "node:events";
import { createServer, type Server, type Socket } from "node:net";

export class MockSmtpServer extends EventEmitter {
  private server: Server;
  private port: number;
  private connections: Set<Socket> = new Set();
  private responses: Map<string, SmtpResponse> = new Map();
  private receivedMessages: MockSmtpMessage[] = [];
  private timeouts: Set<number | NodeJS.Timeout> = new Set();
  private lastAuthCommand: string | null = null;

  constructor(port: number = 0) {
    super();
    this.port = port;
    this.server = createServer();
    this.setupDefaultResponses();
    this.setupServerHandlers();
  }

  private setupDefaultResponses(): void {
    this.responses.set("GREETING", {
      code: 220,
      message: "Mock SMTP Server ready",
    });
    this.responses.set("EHLO", {
      code: 250,
      message: "Hello, pleased to meet you",
    });
    this.responses.set("AUTH", {
      code: 235,
      message: "Authentication successful",
    });
    this.responses.set("MAIL", { code: 250, message: "OK" });
    this.responses.set("RCPT", { code: 250, message: "OK" });
    this.responses.set("DATA", {
      code: 354,
      message: "Start mail input; end with <CRLF>.<CRLF>",
    });
    this.responses.set("DATA_END", {
      code: 250,
      message: "OK: Message accepted for delivery",
    });
    this.responses.set("RSET", { code: 250, message: "OK" });
    this.responses.set("QUIT", { code: 221, message: "Bye" });
    this.responses.set("STARTTLS", {
      code: 220,
      message: "Ready to start TLS",
    });
  }

  private setupServerHandlers(): void {
    this.server.on("connection", (socket: Socket) => {
      this.connections.add(socket);

      socket.on("close", () => {
        this.connections.delete(socket);
      });

      socket.on("error", (error) => {
        this.emit("error", error);
      });

      // Send greeting
      const greeting = this.responses.get("GREETING")!;
      socket.write(`${greeting.code} ${greeting.message}\r\n`);

      let buffer = "";
      let inDataMode = false;
      let currentMessage: Partial<MockSmtpMessage> = {};
      // When set, the server has sent a SASL failure challenge (334) for an
      // OAuth mechanism and is awaiting the client's continuation line (an
      // empty line for XOAUTH2, or "AQ==" for OAUTHBEARER) before sending the
      // final failure reply.
      let awaitingOAuthFailure: "xoauth2" | "oauthbearer" | null = null;
      // When set, the client used the two-step SASL form (`AUTH <mech>` without
      // an inline initial response) and the next line is that initial response.
      let awaitingSaslInitialResponse: "xoauth2" | "oauthbearer" | null = null;

      // Replies to an OAuth SASL initial response: success (235) or a 334
      // failure challenge that awaits the client's continuation line.
      const respondToOAuth = (mechanism: "xoauth2" | "oauthbearer") => {
        const authResponse = this.responses.get("AUTH")!;
        if (authResponse.code === 235) {
          socket.write(`${authResponse.code} ${authResponse.message}\r\n`);
        } else {
          socket.write("334 eyJzdGF0dXMiOiJpbnZhbGlkX3Rva2VuIn0=\r\n");
          awaitingOAuthFailure = mechanism;
        }
      };

      socket.on("data", (data) => {
        buffer += data.toString();

        if (inDataMode) {
          // In DATA mode, look for end of message
          if (buffer.includes("\r\n.\r\n")) {
            const messageData = buffer.substring(
              0,
              buffer.indexOf("\r\n.\r\n"),
            );
            currentMessage.data = messageData;
            this.receivedMessages.push(currentMessage as MockSmtpMessage);

            const response = this.responses.get("DATA_END")!;
            socket.write(`${response.code} ${response.message}\r\n`);

            inDataMode = false;
            buffer = buffer.substring(buffer.indexOf("\r\n.\r\n") + 5);
            currentMessage = {};
          }
          return;
        }

        const lines = buffer.split("\r\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          // Consume the two-step SASL initial response sent on its own line.
          if (awaitingSaslInitialResponse != null) {
            const mechanism = awaitingSaslInitialResponse;
            awaitingSaslInitialResponse = null;
            respondToOAuth(mechanism);
            continue;
          }

          // Validate and drain the OAuth SASL failure continuation (an empty
          // line for XOAUTH2, "AQ==" for OAUTHBEARER) before the empty-line skip
          // below, so a wrong continuation is rejected instead of masked.
          if (awaitingOAuthFailure != null) {
            const expected = awaitingOAuthFailure === "xoauth2" ? "" : "AQ==";
            if (line === expected) {
              const authResponse = this.responses.get("AUTH")!;
              socket.write(`${authResponse.code} ${authResponse.message}\r\n`);
            } else {
              socket.write("501 Invalid OAuth continuation\r\n");
            }
            awaitingOAuthFailure = null;
            continue;
          }

          if (!line.trim()) continue;

          const command = line.split(" ")[0].toUpperCase();

          switch (command) {
            case "EHLO":
            // deno-lint-ignore no-case-declarations
            case "HELO":
              const ehloResponse = this.responses.get("EHLO")!;
              socket.write(`${ehloResponse.code}-${ehloResponse.message}\r\n`);
              socket.write("250-AUTH PLAIN LOGIN XOAUTH2 OAUTHBEARER\r\n");
              // Note: STARTTLS removed from default capabilities
              // Mock server doesn't actually perform TLS upgrade
              // Tests can manually send STARTTLS command if needed
              socket.write("250 HELP\r\n");
              break;

            case "AUTH": {
              this.lastAuthCommand = line;
              const parts = line.split(" ");
              const mechanism = parts[1]?.toUpperCase();
              if (mechanism === "XOAUTH2" || mechanism === "OAUTHBEARER") {
                const mech = mechanism === "XOAUTH2"
                  ? "xoauth2"
                  : "oauthbearer";
                if (parts.length >= 3) {
                  respondToOAuth(mech);
                } else {
                  // Two-step form: the client omitted the initial response, so
                  // request it with an empty 334 challenge.
                  socket.write("334 \r\n");
                  awaitingSaslInitialResponse = mech;
                }
              } else if (line.includes("PLAIN")) {
                const authResponse = this.responses.get("AUTH")!;
                socket.write(
                  `${authResponse.code} ${authResponse.message}\r\n`,
                );
              } else if (line.includes("LOGIN")) {
                // AUTH LOGIN requires multi-step process
                socket.write("334 VXNlcm5hbWU6\r\n"); // "Username:" in base64
              } else {
                socket.write("334 Continue\r\n");
              }
              break;
            }

            // deno-lint-ignore no-case-declarations
            case "MAIL":
              currentMessage.from = this.extractEmail(line);
              const mailResponse = this.responses.get("MAIL")!;
              socket.write(`${mailResponse.code} ${mailResponse.message}\r\n`);
              break;

              // deno-lint-ignore no-case-declarations
            case "RCPT":
              if (!currentMessage.to) currentMessage.to = [];
              currentMessage.to.push(this.extractEmail(line));
              const rcptResponse = this.responses.get("RCPT")!;
              socket.write(`${rcptResponse.code} ${rcptResponse.message}\r\n`);
              break;

              // deno-lint-ignore no-case-declarations
            case "DATA":
              inDataMode = true;
              const dataResponse = this.responses.get("DATA")!;
              socket.write(`${dataResponse.code} ${dataResponse.message}\r\n`);
              break;

              // deno-lint-ignore no-case-declarations
            case "RSET":
              currentMessage = {};
              const rsetResponse = this.responses.get("RSET")!;
              socket.write(`${rsetResponse.code} ${rsetResponse.message}\r\n`);
              break;

            case "STARTTLS": {
              // Note: This is a simplified mock that doesn't actually upgrade to TLS
              // For real TLS testing, use integration tests with actual SMTP servers
              const starttlsResponse = this.responses.get("STARTTLS")!;
              socket.write(
                `${starttlsResponse.code} ${starttlsResponse.message}\r\n`,
              );
              break;
            }

            case "QUIT": {
              const quitResponse = this.responses.get("QUIT")!;
              socket.write(`${quitResponse.code} ${quitResponse.message}\r\n`);
              socket.end();
              break;
            }

            default:
              // Handle base64 encoded username/password for AUTH LOGIN
              if (this.responses.get("AUTH")?.code === 235) {
                if (line.includes("dGVzdHVzZXI=")) { // "testuser" in base64
                  socket.write("334 UGFzc3dvcmQ6\r\n"); // "Password:" in base64
                } else if (line.includes("dGVzdHBhc3M=")) { // "testpass" in base64
                  const authResponse = this.responses.get("AUTH")!;
                  socket.write(
                    `${authResponse.code} ${authResponse.message}\r\n`,
                  );
                } else {
                  socket.write("334 Continue\r\n");
                }
              } else {
                socket.write("500 Command not recognized\r\n");
              }
          }
        }
      });
    });
  }

  private extractEmail(line: string): string {
    const match = line.match(/<([^>]+)>/);
    return match ? match[1] : "";
  }

  start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server.listen(this.port, () => {
        const address = this.server.address();
        if (address && typeof address === "object") {
          this.port = address.port;
          resolve(this.port);
        } else {
          reject(new Error("Failed to start server"));
        }
      });

      this.server.on("error", reject);
    });
  }

  async stop(): Promise<void> {
    // Immediately destroy all connections
    for (const socket of this.connections) {
      socket.removeAllListeners();
      socket.destroy();
    }
    this.connections.clear();

    // Clear all timeouts immediately
    for (const timeout of this.timeouts) {
      // deno-lint-ignore no-explicit-any
      clearTimeout(timeout as any);
    }
    this.timeouts.clear();

    // Close the server and wait for it to complete
    await new Promise<void>((resolve) => {
      this.server.removeAllListeners();
      this.server.close(() => {
        resolve();
      });

      // Failsafe timeout
      setTimeout(() => {
        resolve();
      }, 100);
    });

    // Give the event loop a chance to clean up
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  setResponse(command: string, response: SmtpResponse): void {
    this.responses.set(command, response);
  }

  getReceivedMessages(): MockSmtpMessage[] {
    return [...this.receivedMessages];
  }

  getLastAuthCommand(): string | null {
    return this.lastAuthCommand;
  }

  clearReceivedMessages(): void {
    this.receivedMessages = [];
  }

  getPort(): number {
    return this.port;
  }
}

export interface SmtpResponse {
  code: number;
  message: string;
}

export interface MockSmtpMessage {
  from: string;
  to: string[];
  data: string;
}

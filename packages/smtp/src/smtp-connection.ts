import { Socket } from "node:net";
import { connect as tlsConnect, TLSSocket } from "node:tls";
import {
  createSmtpConfig,
  type ResolvedSmtpConfig,
  type SmtpConfig,
} from "./config.ts";
import type { SmtpMessage } from "./message-converter.ts";

export class SmtpConnection {
  socket: Socket | TLSSocket | null = null;
  config: ResolvedSmtpConfig;
  authenticated = false;
  capabilities: string[] = [];

  constructor(config: SmtpConfig) {
    this.config = createSmtpConfig(config);
  }

  connect(signal?: AbortSignal): Promise<void> {
    if (this.socket) {
      throw new Error("Connection already established");
    }

    signal?.throwIfAborted();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.socket?.destroy();
        reject(new Error("Connection timeout"));
      }, this.config.connectionTimeout);

      const onConnect = () => {
        clearTimeout(timeout);
        resolve();
      };

      const onError = (error: Error) => {
        clearTimeout(timeout);
        reject(error);
      };

      if (this.config.secure) {
        this.socket = tlsConnect({
          host: this.config.host,
          port: this.config.port,
          rejectUnauthorized: this.config.tls?.rejectUnauthorized ?? true,
          ca: this.config.tls?.ca,
          key: this.config.tls?.key,
          cert: this.config.tls?.cert,
          minVersion: this.config.tls?.minVersion,
          maxVersion: this.config.tls?.maxVersion,
        });
      } else {
        this.socket = new Socket();
        this.socket.connect(this.config.port, this.config.host);
      }

      this.socket.setTimeout(this.config.socketTimeout);
      this.socket.once("connect", onConnect);
      this.socket.once("error", onError);
      this.socket.once("timeout", () => {
        clearTimeout(timeout);
        this.socket?.destroy();
        reject(new Error("Socket timeout"));
      });
    });
  }

  sendCommand(command: string, signal?: AbortSignal): Promise<SmtpResponse> {
    if (!this.socket) {
      throw new Error("Not connected");
    }

    signal?.throwIfAborted();

    return new Promise((resolve, reject) => {
      let buffer = "";
      const timeout = setTimeout(() => {
        reject(new Error("Command timeout"));
      }, this.config.socketTimeout);

      const onData = (data: Uint8Array) => {
        buffer += data.toString();
        const lines = buffer.split("\r\n");

        // Keep incomplete line in buffer
        const incompleteLine = lines.pop() || "";

        // Check if we have a complete response
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.length >= 4 && line[3] === " ") {
            // Found the final line of the response
            const code = parseInt(line.substring(0, 3), 10);
            const message = line.substring(4);
            const fullResponse = lines.slice(0, i + 1).join("\r\n");

            cleanup();
            resolve({ code, message, raw: fullResponse });
            return;
          }
        }

        // Update buffer with incomplete line
        buffer = incompleteLine;
      };

      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };

      const cleanup = () => {
        clearTimeout(timeout);
        this.socket?.off("data", onData);
        this.socket?.off("error", onError);
      };

      this.socket!.on("data", onData);
      this.socket!.on("error", onError);
      this.socket!.write(command + "\r\n");
    });
  }

  greeting(signal?: AbortSignal): Promise<SmtpResponse> {
    if (!this.socket) {
      throw new Error("Not connected");
    }

    signal?.throwIfAborted();

    return new Promise((resolve, reject) => {
      let buffer = "";
      const timeout = setTimeout(() => {
        reject(new Error("Greeting timeout"));
      }, this.config.socketTimeout);

      const onData = (data: Uint8Array) => {
        buffer += data.toString();
        const lines = buffer.split("\r\n");

        for (const line of lines) {
          if (line.length >= 4 && line[3] === " ") {
            const code = parseInt(line.substring(0, 3), 10);
            const message = line.substring(4);

            cleanup();
            resolve({ code, message, raw: buffer });
            return;
          }
        }
      };

      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };

      const cleanup = () => {
        clearTimeout(timeout);
        this.socket?.off("data", onData);
        this.socket?.off("error", onError);
      };

      this.socket!.on("data", onData);
      this.socket!.on("error", onError);
    });
  }

  async ehlo(signal?: AbortSignal): Promise<void> {
    const response = await this.sendCommand(
      `EHLO ${this.config.localName}`,
      signal,
    );
    if (response.code !== 250) {
      throw new Error(`EHLO failed: ${response.message}`);
    }

    // Parse capabilities
    this.capabilities = response.raw
      .split("\r\n")
      .filter((line) => line.startsWith("250-") || line.startsWith("250 "))
      .map((line) => line.substring(4))
      .filter((line) => line.length > 0);
  }

  async starttls(signal?: AbortSignal): Promise<void> {
    if (!this.socket) {
      throw new Error("Not connected");
    }

    if (this.socket instanceof TLSSocket) {
      throw new Error("Connection is already using TLS");
    }

    signal?.throwIfAborted();

    // Send STARTTLS command
    const response = await this.sendCommand("STARTTLS", signal);
    if (response.code !== 220) {
      throw new Error(`STARTTLS failed: ${response.message}`);
    }

    signal?.throwIfAborted();

    // Upgrade the socket to TLS
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.socket?.destroy();
        reject(new Error("STARTTLS upgrade timeout"));
      }, this.config.connectionTimeout);

      const plainSocket = this.socket as Socket;

      const tlsSocket = tlsConnect({
        socket: plainSocket,
        host: this.config.host,
        rejectUnauthorized: this.config.tls?.rejectUnauthorized ?? true,
        ca: this.config.tls?.ca,
        key: this.config.tls?.key,
        cert: this.config.tls?.cert,
        minVersion: this.config.tls?.minVersion,
        maxVersion: this.config.tls?.maxVersion,
      });

      const onSecureConnect = () => {
        clearTimeout(timeout);
        this.socket = tlsSocket;
        this.socket.setTimeout(this.config.socketTimeout);
        resolve();
      };

      const onError = (error: Error) => {
        clearTimeout(timeout);
        tlsSocket.destroy();
        reject(error);
      };

      tlsSocket.once("secureConnect", onSecureConnect);
      tlsSocket.once("error", onError);
      tlsSocket.once("timeout", () => {
        clearTimeout(timeout);
        tlsSocket.destroy();
        reject(new Error("TLS upgrade timeout"));
      });
    });
  }

  async authenticate(signal?: AbortSignal): Promise<void> {
    if (!this.config.auth) {
      return;
    }

    if (this.authenticated) {
      return;
    }

    const authMethod = this.config.auth.method ?? "plain";

    if (
      !this.capabilities.some((cap) => cap.toUpperCase().startsWith("AUTH"))
    ) {
      throw new Error("Server does not support authentication");
    }

    switch (authMethod) {
      case "plain":
        await this.authPlain(signal);
        break;
      case "login":
        await this.authLogin(signal);
        break;
      default:
        throw new Error(`Unsupported authentication method: ${authMethod}`);
    }

    this.authenticated = true;
  }

  private async authPlain(signal?: AbortSignal): Promise<void> {
    const { user, pass } = this.config.auth!;
    const credentials = btoa(`\0${user}\0${pass}`);
    const response = await this.sendCommand(
      `AUTH PLAIN ${credentials}`,
      signal,
    );

    if (response.code !== 235) {
      throw new Error(`Authentication failed: ${response.message}`);
    }
  }

  async authLogin(signal?: AbortSignal): Promise<void> {
    const { user, pass } = this.config.auth!;

    let response = await this.sendCommand("AUTH LOGIN", signal);
    if (response.code !== 334) {
      throw new Error(`AUTH LOGIN failed: ${response.message}`);
    }

    response = await this.sendCommand(btoa(user), signal);
    if (response.code !== 334) {
      throw new Error(`Username authentication failed: ${response.message}`);
    }

    response = await this.sendCommand(btoa(pass), signal);
    if (response.code !== 235) {
      throw new Error(`Password authentication failed: ${response.message}`);
    }
  }

  async sendMessage(
    message: SmtpMessage,
    signal?: AbortSignal,
  ): Promise<string> {
    // MAIL FROM
    const mailResponse = await this.sendCommand(
      `MAIL FROM:<${message.envelope.from}>`,
      signal,
    );
    if (mailResponse.code !== 250) {
      throw new Error(`MAIL FROM failed: ${mailResponse.message}`);
    }

    // RCPT TO
    for (const recipient of message.envelope.to) {
      signal?.throwIfAborted();
      const rcptResponse = await this.sendCommand(
        `RCPT TO:<${recipient}>`,
        signal,
      );
      if (rcptResponse.code !== 250) {
        throw new Error(
          `RCPT TO failed for ${recipient}: ${rcptResponse.message}`,
        );
      }
    }

    // DATA
    const dataResponse = await this.sendCommand("DATA", signal);
    if (dataResponse.code !== 354) {
      throw new Error(`DATA failed: ${dataResponse.message}`);
    }

    // Message content
    const content = message.raw.replace(/\n\./g, "\n..");
    const finalResponse = await this.sendCommand(`${content}\r\n.`, signal);
    if (finalResponse.code !== 250) {
      throw new Error(`Message send failed: ${finalResponse.message}`);
    }

    // Extract message ID from response
    const messageId = this.extractMessageId(finalResponse.message);
    return messageId;
  }

  extractMessageId(response: string): string {
    const match = response.match(/(?:Message-ID:|id=)[\s<]*([^>\s]+)/i);
    return match
      ? match[1]
      : `smtp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  async quit(): Promise<void> {
    if (!this.socket) {
      return;
    }

    try {
      await this.sendCommand("QUIT");
    } catch {
      // Ignore errors during quit
    }

    this.socket.destroy();
    this.socket = null;
    this.authenticated = false;
    this.capabilities = [];
  }

  async reset(signal?: AbortSignal): Promise<void> {
    if (!this.socket) {
      throw new Error("Not connected");
    }

    const response = await this.sendCommand("RSET", signal);
    if (response.code !== 250) {
      throw new Error(`RESET failed: ${response.message}`);
    }
  }
}

export interface SmtpResponse {
  readonly code: number;
  readonly message: string;
  readonly raw: string;
}

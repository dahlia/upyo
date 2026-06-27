import { Socket } from "node:net";
import { connect as tlsConnect, TLSSocket } from "node:tls";
import {
  createSmtpConfig,
  type ResolvedSmtpConfig,
  type SmtpConfig,
  type SmtpOAuth2Auth,
  type SmtpUserPassAuth,
} from "./config.ts";
import {
  formatOauthbearer,
  formatXoauth2,
  OAuth2TokenManager,
  selectOAuth2Mechanism,
  SmtpAuthError,
} from "./oauth2.ts";
import type { SmtpMessage } from "./message-converter.ts";

/**
 * The maximum length of an SMTP command line, including the terminating CRLF,
 * as specified by RFC 5321 §4.5.3.1.4.
 */
const MAX_COMMAND_LINE_LENGTH = 512;

/** The length of the CRLF terminator appended to every command. */
const CRLF_LENGTH = 2;

/**
 * How long, in milliseconds, to wait for the graceful `QUIT` to flush during
 * teardown before giving up, so an unresponsive server cannot block shutdown
 * for the full socket timeout.
 */
const QUIT_TIMEOUT_MS = 5000;

/**
 * Whether a host refers to the local loopback interface, for which cleartext
 * OAuth 2.0 authentication is permitted (e.g. local testing and development).
 *
 * @param host The host to check.
 * @returns `true` if the host is a loopback address.
 */
function isLoopbackHost(host: string): boolean {
  return host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "[::1]";
}

export class SmtpConnection {
  socket: Socket | TLSSocket | null = null;
  config: ResolvedSmtpConfig;
  authenticated = false;
  capabilities: string[] = [];
  tokenManager: OAuth2TokenManager | null;

  constructor(config: SmtpConfig, tokenManager?: OAuth2TokenManager) {
    this.config = createSmtpConfig(config);
    this.tokenManager = tokenManager ?? null;
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
    const auth = this.config.auth;
    if (!auth) {
      return;
    }

    if (this.authenticated) {
      return;
    }

    if (
      !this.capabilities.some((cap) => cap.toUpperCase().startsWith("AUTH"))
    ) {
      throw new SmtpAuthError("Server does not support authentication.");
    }

    if ("accessToken" in auth || "refreshToken" in auth) {
      // OAuth 2.0 access tokens are bearer credentials, so refuse to send them
      // over a cleartext connection.  Loopback hosts are excepted for local
      // testing and development.
      if (
        !(this.socket instanceof TLSSocket) &&
        !isLoopbackHost(this.config.host)
      ) {
        throw new SmtpAuthError(
          "OAuth 2.0 authentication requires a TLS-secured connection to " +
            "protect the access token; use `secure: true` or STARTTLS.",
        );
      }

      const mechanism = auth.method ?? selectOAuth2Mechanism(this.capabilities);
      switch (mechanism) {
        case "xoauth2":
          await this.authXoauth2(auth, signal);
          break;
        case "oauthbearer":
          await this.authOauthbearer(auth, signal);
          break;
        default:
          throw new SmtpAuthError(
            `Unsupported authentication method: ${mechanism}`,
          );
      }
    } else {
      const method = auth.method ?? "plain";
      switch (method) {
        case "plain":
          await this.authPlain(auth, signal);
          break;
        case "login":
          await this.authLogin(auth, signal);
          break;
        default:
          throw new Error(`Unsupported authentication method: ${method}`);
      }
    }

    this.authenticated = true;
  }

  private async authPlain(
    auth: SmtpUserPassAuth,
    signal?: AbortSignal,
  ): Promise<void> {
    const { user, pass } = auth;
    const credentials = btoa(`\0${user}\0${pass}`);
    const response = await this.sendCommand(
      `AUTH PLAIN ${credentials}`,
      signal,
    );

    if (response.code !== 235) {
      throw new Error(`Authentication failed: ${response.message}`);
    }
  }

  async authLogin(
    auth: SmtpUserPassAuth,
    signal?: AbortSignal,
  ): Promise<void> {
    const { user, pass } = auth;

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

  /**
   * Resolves an OAuth 2.0 access token via the connection's token manager,
   * creating a standalone manager from the auth config if none was injected.
   */
  private async getOAuth2Token(
    auth: SmtpOAuth2Auth,
    signal?: AbortSignal,
  ): Promise<string> {
    this.tokenManager ??= new OAuth2TokenManager(auth);
    return await this.tokenManager.getAccessToken(signal);
  }

  private async authXoauth2(
    auth: SmtpOAuth2Auth,
    signal?: AbortSignal,
  ): Promise<void> {
    const token = await this.getOAuth2Token(auth, signal);
    const initialResponse = formatXoauth2(auth.user, token);
    const response = await this.sendSaslAuth(
      "XOAUTH2",
      initialResponse,
      signal,
    );
    // On failure XOAUTH2 servers send a 334 challenge; the client replies with
    // an empty line to receive the final failure response.
    await this.finishOAuth2(response, "XOAUTH2", "", signal);
  }

  private async authOauthbearer(
    auth: SmtpOAuth2Auth,
    signal?: AbortSignal,
  ): Promise<void> {
    const token = await this.getOAuth2Token(auth, signal);
    const initialResponse = formatOauthbearer(
      auth.user,
      token,
      this.config.host,
      this.config.port,
    );
    const response = await this.sendSaslAuth(
      "OAUTHBEARER",
      initialResponse,
      signal,
    );
    // RFC 7628: on failure the client replies with a single 0x01 ("AQ==") to
    // receive the final failure response.
    await this.finishOAuth2(response, "OAUTHBEARER", "AQ==", signal);
  }

  /**
   * Sends a SASL `AUTH` command with its Base64 initial response.
   *
   * When the resulting command line would exceed the SMTP command-line length
   * limit (e.g. a long Outlook JWT access token), RFC 4954 requires the client
   * to omit the initial response and send it on its own line after the server's
   * `334` challenge.  This method transparently falls back to that two-step
   * form, since some servers reject the over-long single-line command outright.
   *
   * @param mechanism The SASL mechanism name (e.g. `XOAUTH2`).
   * @param initialResponse The Base64-encoded initial client response.
   * @param signal An optional {@link AbortSignal}.
   * @returns The server's response to the initial response.
   */
  private async sendSaslAuth(
    mechanism: string,
    initialResponse: string,
    signal?: AbortSignal,
  ): Promise<SmtpResponse> {
    const inlineCommand = `AUTH ${mechanism} ${initialResponse}`;
    if (inlineCommand.length + CRLF_LENGTH <= MAX_COMMAND_LINE_LENGTH) {
      return await this.sendCommand(inlineCommand, signal);
    }

    const challenge = await this.sendCommand(`AUTH ${mechanism}`, signal);
    if (challenge.code !== 334) {
      return challenge;
    }
    return await this.sendCommand(initialResponse, signal);
  }

  /**
   * Interprets the server's reply to an OAuth SASL initial response, draining
   * the failure challenge continuation when authentication is rejected.
   *
   * @throws {SmtpAuthError} If authentication did not succeed.
   */
  private async finishOAuth2(
    response: SmtpResponse,
    mechanism: string,
    continuation: string,
    signal?: AbortSignal,
  ): Promise<void> {
    if (response.code === 235) {
      return;
    }
    if (response.code === 334) {
      let finalMessage = "";
      try {
        const final = await this.sendCommand(continuation, signal);
        finalMessage = ` (${final.message})`;
      } catch {
        // Some servers close the connection after rejecting authentication, so
        // sending the continuation fails; keep the decoded challenge as the
        // error detail rather than masking it with a socket error.
        signal?.throwIfAborted();
      }
      throw new SmtpAuthError(
        `${mechanism} authentication failed: ` +
          `${decodeOAuth2Challenge(response.message)}${finalMessage}`,
      );
    }
    throw new SmtpAuthError(
      `${mechanism} authentication failed: ${response.message}`,
    );
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
    const socket = this.socket;
    if (!socket) {
      return;
    }

    // Only attempt a graceful QUIT on a writable socket; a socket that never
    // finished connecting (e.g. a refused or timed-out connection) would
    // otherwise error or leave a dangling command timeout.
    if (socket.writable) {
      // Send QUIT best-effort and wait only until it has been flushed (bounded
      // by QUIT_TIMEOUT_MS) rather than for the server's reply, so an
      // unresponsive server cannot block teardown for the full socket timeout.
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, QUIT_TIMEOUT_MS);
        try {
          socket.write("QUIT\r\n", () => {
            clearTimeout(timer);
            resolve();
          });
        } catch {
          clearTimeout(timer);
          resolve();
        }
      });
    }

    try {
      socket.destroy();
    } catch {
      // Ignore errors while tearing down the socket
    }
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

/**
 * Decodes the Base64 JSON error challenge a server sends after a failed OAuth
 * SASL exchange, falling back to the raw message when it is not valid Base64.
 *
 * @param message The challenge text from the server's 334 response.
 * @returns A human-readable description of the failure.
 */
function decodeOAuth2Challenge(message: string): string {
  try {
    return atob(message.trim());
  } catch {
    return message;
  }
}

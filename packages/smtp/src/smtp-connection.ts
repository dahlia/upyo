import { Buffer } from "node:buffer";
import { Socket } from "node:net";
import { connect as tlsConnect, TLSSocket } from "node:tls";
import {
  createSmtpConfig,
  type ResolvedSmtpConfig,
  type SmtpConfig,
  type SmtpOAuth2Auth,
  type SmtpUserPassAuth,
} from "./config.ts";
import { SmtpDsnUnsupportedError } from "./delivery-status.ts";
import {
  formatOauthbearer,
  formatXoauth2,
  OAuth2TokenManager,
  selectOAuth2Mechanism,
  SmtpAuthError,
} from "./oauth2.ts";
import type { SmtpMessage } from "./message-converter.ts";
import type { SmtpRejectedRecipient } from "./smtp-receipt.ts";
import { parseEnhancedSmtpStatusCode } from "./smtp-status-code.ts";

interface SmtpSendResult {
  readonly messageId: string;
  readonly rejectedRecipients: readonly SmtpRejectedRecipient[];
}

interface SmtpSizeCapability {
  readonly maximum: bigint | null;
}

/**
 * Error thrown when a message exceeds the fixed limit advertised through the
 * SMTP SIZE extension.
 *
 * The check happens before `MAIL FROM`, so the SMTP connection remains usable
 * for another message.
 *
 * @since 0.6.0
 */
export class SmtpMessageSizeError extends RangeError {
  /** The encoded message size in octets. */
  readonly actualSize: number;

  /** The fixed maximum advertised by the SMTP server. */
  readonly maximumSize: bigint;

  /**
   * Creates an SMTP message-size error.
   *
   * @param actualSize The encoded message size in octets.
   * @param maximumSize The fixed maximum advertised by the SMTP server.
   */
  constructor(actualSize: number, maximumSize: bigint) {
    super(
      `Message size ${actualSize} octets exceeds the server's maximum of ` +
        `${maximumSize} octets.`,
    );
    this.name = "SmtpMessageSizeError";
    this.actualSize = actualSize;
    this.maximumSize = maximumSize;
  }
}

/**
 * Error thrown when an internationalized message requires an SMTP extension
 * that the server did not advertise.
 *
 * The check happens before `MAIL FROM`, so the SMTP connection remains usable
 * for another message.
 *
 * @since 0.6.0
 */
export class SmtpUtf8UnsupportedError extends Error {
  /** The required SMTP extension that the server did not advertise. */
  readonly missingCapability: "SMTPUTF8" | "8BITMIME";

  /**
   * Creates an SMTPUTF8 support error.
   *
   * @param missingCapability The required extension that was not advertised.
   */
  constructor(missingCapability: "SMTPUTF8" | "8BITMIME") {
    super(
      missingCapability === "SMTPUTF8"
        ? "The SMTP server does not advertise SMTPUTF8."
        : "The SMTP server advertises SMTPUTF8 without the required " +
          "8BITMIME capability.",
    );
    this.name = "SmtpUtf8UnsupportedError";
    this.missingCapability = missingCapability;
  }
}

class SmtpPipelineTerminatedError extends Error {
  readonly responseIndex: number;
  readonly response: SmtpResponse;

  constructor(responseIndex: number, response: SmtpResponse) {
    super("SMTP pipeline terminated by the server.");
    this.name = "SmtpPipelineTerminatedError";
    this.responseIndex = responseIndex;
    this.response = response;
  }
}

/**
 * The maximum length of an SMTP command line, including the terminating CRLF,
 * as specified by RFC 5321 §4.5.3.1.4.
 */
const MAX_COMMAND_LINE_LENGTH = 512;

/** The length of the CRLF terminator appended to every command. */
const CRLF_LENGTH = 2;

/**
 * Finds the RFC 1870 SIZE extension and its optional fixed maximum.
 *
 * A zero maximum and an omitted maximum both mean that no fixed limit is in
 * force.  A malformed parameter does not prevent use of the extension, but it
 * cannot be used as a local limit.
 *
 * @param capabilities The extension lines returned by EHLO.
 * @returns The SIZE capability, or `null` when it was not advertised.
 */
function parseSizeCapability(
  capabilities: readonly string[],
): SmtpSizeCapability | null {
  const capability = capabilities.find((value) =>
    /^SIZE(?:[ \t]|$)/i.test(value)
  );
  if (capability == null) return null;

  const match = /^SIZE(?:[ \t]+([0-9]+))?[ \t]*$/i.exec(capability);
  if (match?.[1] == null) return { maximum: null };

  const maximum = BigInt(match[1]);
  return { maximum: maximum === 0n ? null : maximum };
}

/**
 * How long, in milliseconds, to wait for the graceful `QUIT` to flush during
 * teardown before giving up, so an unresponsive server cannot block shutdown
 * for the full socket timeout.
 */
const QUIT_TIMEOUT_MS = 5000;

/**
 * Parse an IPv4 address into its four octets.
 *
 * @param address The IPv4 address to parse.
 * @returns The parsed octets, or `null` if the address is invalid.
 */
function parseIpv4Address(address: string): readonly number[] | null {
  const octets = address.split(".");
  if (
    octets.length !== 4 ||
    !octets.every((octet) =>
      /^(?:0|[1-9]\d{0,2})$/.test(octet) && Number(octet) <= 255
    )
  ) {
    return null;
  }

  return octets.map(Number);
}

/**
 * Parse an IPv6 address into its eight 16-bit groups.
 *
 * @param address The IPv6 address to parse.
 * @returns The parsed groups, or `null` if the address is invalid.
 */
function parseIpv6Address(address: string): readonly number[] | null {
  const compressionParts = address.split("::");
  if (compressionParts.length > 2) return null;

  function parseGroups(part: string): readonly number[] | null {
    if (part === "") return [];

    const tokens = part.split(":");
    const groups: number[] = [];
    for (const [index, token] of tokens.entries()) {
      if (token.includes(".")) {
        if (index !== tokens.length - 1) return null;
        const octets = parseIpv4Address(token);
        if (octets == null) return null;
        groups.push(
          octets[0] << 8 | octets[1],
          octets[2] << 8 | octets[3],
        );
      } else if (/^[0-9a-f]{1,4}$/.test(token)) {
        groups.push(Number.parseInt(token, 16));
      } else {
        return null;
      }
    }
    return groups;
  }

  const left = parseGroups(compressionParts[0]);
  const right = parseGroups(compressionParts[1] ?? "");
  if (left == null || right == null) return null;

  if (compressionParts.length === 1) {
    return left.length === 8 ? left : null;
  }

  const omittedGroups = 8 - left.length - right.length;
  if (omittedGroups < 1) return null;
  return [
    ...left,
    ...Array.from({ length: omittedGroups }, () => 0),
    ...right,
  ];
}

/**
 * Whether an IP address refers to the local loopback interface.
 *
 * @param address The IPv4 or IPv6 address to check.
 * @returns `true` if the address is a loopback address.
 */
function isLoopbackAddress(address: string): boolean {
  let normalized = address.toLowerCase();
  if (normalized.startsWith("[") && normalized.endsWith("]")) {
    normalized = normalized.slice(1, -1);
  }
  const zoneIndex = normalized.indexOf("%");
  if (zoneIndex >= 0) normalized = normalized.slice(0, zoneIndex);

  const ipv4Octets = parseIpv4Address(normalized);
  if (ipv4Octets != null) return ipv4Octets[0] === 127;

  const ipv6Groups = parseIpv6Address(normalized);
  if (ipv6Groups == null) return false;
  return (
    ipv6Groups.slice(0, 7).every((group) => group === 0) &&
    ipv6Groups[7] === 1
  ) || (
    ipv6Groups.slice(0, 5).every((group) => group === 0) &&
    ipv6Groups[5] === 0xffff &&
    ipv6Groups[6] >> 8 === 127
  );
}

/**
 * Whether a configured host name or address represents a loopback endpoint.
 *
 * This is a fallback for sockets that do not expose their connected peer
 * address.  A connected peer address takes precedence so a misleading host
 * name cannot bypass the TLS requirement.
 *
 * @param host The configured SMTP host.
 * @returns `true` if the host represents a loopback endpoint.
 */
function isLoopbackHost(host: string): boolean {
  const normalized = host.toLowerCase().replace(/\.$/, "");
  return normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    isLoopbackAddress(normalized);
}

/**
 * Whether the SMTP connection is local enough to permit cleartext
 * authentication during development.
 *
 * @param socket The connected SMTP socket, if available.
 * @param host The configured SMTP host.
 * @returns `true` if the connected peer or fallback host is loopback.
 */
function isLoopbackConnection(socket: Socket | null, host: string): boolean {
  const remoteAddress = socket?.remoteAddress;
  return remoteAddress == null
    ? isLoopbackHost(host)
    : isLoopbackAddress(remoteAddress);
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
    return this.sendCommands([command], signal).then((responses) =>
      responses[0]
    );
  }

  /**
   * Sends a group of commands in one write and reads one reply per command.
   *
   * SMTP multiline replies are kept together and complete replies are matched
   * to commands by their position in the returned array, as required for
   * command pipelining by RFC 2920.
   */
  private sendCommands(
    commands: readonly string[],
    signal?: AbortSignal,
  ): Promise<readonly SmtpResponse[]> {
    if (!this.socket) {
      throw new Error("Not connected");
    }

    signal?.throwIfAborted();

    return new Promise((resolve, reject) => {
      let buffer = "";
      let responseLines: string[] = [];
      const responses: SmtpResponse[] = [];
      const startTimeout = () =>
        setTimeout(() => {
          cleanup();
          reject(new Error("Command timeout"));
        }, this.config.socketTimeout);
      let timeout = startTimeout();
      const resetTimeout = () => {
        clearTimeout(timeout);
        timeout = startTimeout();
      };

      const onData = (data: Uint8Array) => {
        buffer += data.toString();
        const lines = buffer.split("\r\n");

        // Keep incomplete line in buffer
        const incompleteLine = lines.pop() || "";

        for (const line of lines) {
          responseLines.push(line);
          if (line.length >= 4 && line[3] === " ") {
            const code = parseInt(line.substring(0, 3), 10);
            const message = line.substring(4);
            const response = {
              code,
              message,
              raw: responseLines.join("\r\n"),
            };
            const responseIndex = responses.length;
            responses.push(response);
            responseLines = [];

            if (responses.length === commands.length) {
              cleanup();
              resolve(responses);
              return;
            }

            if (response.code === 421) {
              cleanup();
              reject(
                new SmtpPipelineTerminatedError(responseIndex, response),
              );
              return;
            }

            resetTimeout();
          }
        }

        // Update buffer with incomplete line
        buffer = incompleteLine;
      };

      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };

      const onClose = () => {
        cleanup();
        const responseIndex = responses.findIndex((response, index) =>
          response.code === 421 || (index === 0 && response.code >= 400)
        );
        if (responseIndex >= 0) {
          reject(
            new SmtpPipelineTerminatedError(
              responseIndex,
              responses[responseIndex],
            ),
          );
          return;
        }
        const completedFailures = responses.flatMap((response, index) =>
          response.code >= 400
            ? [`${commands[index]}: ${response.code} ${response.message}`]
            : []
        );
        const failureDetails = completedFailures.length > 0
          ? ` Completed failures: ${completedFailures.join("; ")}.`
          : "";
        reject(
          new Error(
            `Connection closed before all command responses.${failureDetails}`,
          ),
        );
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
        this.socket?.off("data", onData);
        this.socket?.off("error", onError);
        this.socket?.off("close", onClose);
        signal?.removeEventListener("abort", onAbort);
      };

      this.socket!.on("data", onData);
      this.socket!.on("error", onError);
      this.socket!.on("close", onClose);
      signal?.addEventListener("abort", onAbort, { once: true });
      this.socket!.write(commands.map((command) => `${command}\r\n`).join(""));
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
    if (response.code === 500 || response.code === 502) {
      const heloResponse = await this.sendCommand(
        `HELO ${this.config.localName}`,
        signal,
      );
      if (heloResponse.code !== 250) {
        throw new Error(`HELO failed: ${heloResponse.message}`);
      }
      this.capabilities = [];
      return;
    }
    if (response.code !== 250) {
      throw new Error(`EHLO failed: ${response.message}`);
    }

    // Parse capabilities
    this.capabilities = response.raw
      .split("\r\n")
      .filter((line) => line.startsWith("250-") || line.startsWith("250 "))
      .slice(1)
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

    // Refuse to send credentials over a cleartext connection.  Loopback hosts
    // are excepted for local testing and development.
    if (
      !(this.socket instanceof TLSSocket) &&
      !isLoopbackConnection(this.socket, this.config.host)
    ) {
      throw new SmtpAuthError(
        "SMTP authentication requires a TLS-secured connection to protect " +
          "credentials; use `secure: true` or STARTTLS.",
      );
    }

    if ("accessToken" in auth || "refreshToken" in auth) {
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
  ): Promise<SmtpSendResult> {
    signal?.throwIfAborted();

    let smtpUtf8Parameters = "";
    if (message.requiresSmtpUtf8 === true) {
      if (
        !this.capabilities.some((capability) =>
          /^SMTPUTF8(?:[ \t]|$)/i.test(capability)
        )
      ) {
        throw new SmtpUtf8UnsupportedError("SMTPUTF8");
      }
      if (
        !this.capabilities.some((capability) =>
          /^8BITMIME(?:[ \t]|$)/i.test(capability)
        )
      ) {
        throw new SmtpUtf8UnsupportedError("8BITMIME");
      }
      smtpUtf8Parameters = " BODY=8BITMIME SMTPUTF8";
    }

    const sizeCapability = parseSizeCapability(this.capabilities);
    let sizeParameter = "";
    if (sizeCapability != null) {
      // The final CRLF belongs to the message data.  RFC 1870 excludes both
      // the DATA terminator and any extra dots inserted for transparency.
      const messageSize = Buffer.byteLength(message.raw, "utf8") + CRLF_LENGTH;
      if (
        sizeCapability.maximum != null &&
        BigInt(messageSize) > sizeCapability.maximum
      ) {
        throw new SmtpMessageSizeError(
          messageSize,
          sizeCapability.maximum,
        );
      }
      sizeParameter = ` SIZE=${messageSize}`;
    }

    const dsn = message.envelope.dsn;
    if (
      dsn != null &&
      !this.capabilities.some((capability) => /^DSN[ \t]*$/i.test(capability))
    ) {
      throw new SmtpDsnUnsupportedError();
    }
    const mailDsnParameters = dsn == null || dsn.mailParameters.length === 0
      ? ""
      : ` ${dsn.mailParameters.join(" ")}`;

    const mailCommand = `MAIL FROM:<${message.envelope.from}>` +
      `${sizeParameter}${smtpUtf8Parameters}${mailDsnParameters}`;
    const recipientCommands = message.envelope.to.map((recipient, index) => {
      const parameters = dsn?.recipientParameters[index] ?? [];
      const suffix = parameters.length === 0 ? "" : ` ${parameters.join(" ")}`;
      return `RCPT TO:<${recipient}>${suffix}`;
    });
    const pipelining = this.capabilities.some((capability) =>
      /^PIPELINING(?:\s|$)/i.test(capability)
    );

    let mailResponse: SmtpResponse;
    let recipientResponses: readonly SmtpResponse[];
    if (pipelining) {
      try {
        const envelopeResponses = await this.sendCommands(
          [mailCommand, ...recipientCommands],
          signal,
        );
        mailResponse = envelopeResponses[0];
        recipientResponses = envelopeResponses.slice(1);
      } catch (error) {
        if (!(error instanceof SmtpPipelineTerminatedError)) {
          throw error;
        }

        const { response, responseIndex } = error;
        if (responseIndex === 0) {
          throw new SmtpResponseError(
            `MAIL FROM failed: ${response.message}`,
            response.code,
            "MAIL FROM",
            response.message,
          );
        }

        const recipient = message.envelope.to[responseIndex - 1];
        throw new SmtpResponseError(
          `RCPT TO failed for ${recipient}: ${response.message}`,
          response.code,
          "RCPT TO",
          response.message,
        );
      }
    } else {
      mailResponse = await this.sendCommand(mailCommand, signal);
      recipientResponses = [];
    }

    if (mailResponse.code !== 250) {
      throw new SmtpResponseError(
        `MAIL FROM failed: ${mailResponse.message}`,
        mailResponse.code,
        "MAIL FROM",
        mailResponse.message,
      );
    }

    // RCPT TO
    const rejectedRecipients: SmtpRejectedRecipient[] = [];
    for (const [index, recipient] of message.envelope.to.entries()) {
      signal?.throwIfAborted();
      const rcptResponse = pipelining
        ? recipientResponses[index]
        : await this.sendCommand(recipientCommands[index], signal);
      if (rcptResponse.code === 421) {
        throw new SmtpResponseError(
          `RCPT TO failed for ${recipient}: ${rcptResponse.message}`,
          rcptResponse.code,
          "RCPT TO",
          rcptResponse.message,
        );
      }
      if (rcptResponse.code !== 250 && rcptResponse.code !== 251) {
        const enhancedStatusCode = parseEnhancedSmtpStatusCode(
          rcptResponse.code,
          rcptResponse.message,
        );
        rejectedRecipients.push({
          recipient,
          code: rcptResponse.code,
          response: rcptResponse.message,
          retryable: rcptResponse.code >= 400 && rcptResponse.code < 500,
          ...(enhancedStatusCode == null ? {} : { enhancedStatusCode }),
        });
      }
    }

    if (
      rejectedRecipients.length > 0 &&
      rejectedRecipients.length === message.envelope.to.length
    ) {
      const rejection = rejectedRecipients.find((item) => item.retryable) ??
        rejectedRecipients[0];
      const details = rejectedRecipients.map((item) =>
        `${item.recipient}: ${item.code} ${item.response}`
      ).join("; ");
      throw new SmtpResponseError(
        `RCPT TO failed for every recipient: ${details}`,
        rejection.code,
        "RCPT TO",
        rejection.response,
        rejectedRecipients,
      );
    }

    // DATA
    const dataResponse = await this.sendCommand("DATA", signal);
    if (dataResponse.code !== 354) {
      throw new SmtpResponseError(
        `DATA failed: ${dataResponse.message}`,
        dataResponse.code,
        "DATA",
        dataResponse.message,
      );
    }

    // Message content
    const content = message.raw.replace(/\n\./g, "\n..");
    const finalResponse = await this.sendCommand(`${content}\r\n.`, signal);
    if (finalResponse.code !== 250) {
      throw new SmtpResponseError(
        `Message send failed: ${finalResponse.message}`,
        finalResponse.code,
        "DATA_END",
        finalResponse.message,
      );
    }

    // Extract message ID from response
    const messageId = this.extractMessageId(finalResponse.message);
    return { messageId, rejectedRecipients };
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
        const done = () => {
          clearTimeout(timer);
          socket.off("error", done);
          socket.off("close", done);
          resolve();
        };
        const timer = setTimeout(done, QUIT_TIMEOUT_MS);
        // Teardown is best-effort: an asynchronous socket error or close must
        // not surface as an unhandled error event, so settle on those too.
        socket.once("error", done);
        socket.once("close", done);
        try {
          socket.write("QUIT\r\n", done);
        } catch {
          done();
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

/**
 * Error thrown when an SMTP command receives an unsuccessful server reply.
 *
 * @since 0.5.0
 */
export class SmtpResponseError extends Error {
  /**
   * The numeric SMTP reply code returned by the server.
   */
  readonly code: number;

  /**
   * The SMTP command that produced the reply.
   */
  readonly command: string;

  /**
   * The textual SMTP reply returned by the server.
   */
  readonly response: string;

  /** Recipient-level failures collected for an unsuccessful transaction. */
  readonly rejectedRecipients?: readonly SmtpRejectedRecipient[];

  /**
   * Creates an SMTP response error.
   *
   * @param message Human-readable error message.
   * @param code The numeric SMTP reply code.
   * @param command The SMTP command that produced the reply.
   * @param response The textual SMTP reply returned by the server.
   * @param rejectedRecipients Recipient-level failures collected for the
   *                           transaction.
   */
  constructor(
    message: string,
    code: number,
    command: string,
    response: string,
    rejectedRecipients?: readonly SmtpRejectedRecipient[],
  ) {
    super(message);
    this.name = "SmtpResponseError";
    this.code = code;
    this.command = command;
    this.response = response;
    this.rejectedRecipients = rejectedRecipients;
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
 * The bytes are decoded as UTF-8 (via `TextDecoder`) so non-ASCII challenge
 * messages are not corrupted, unlike decoding `atob`'s Latin-1 output directly.
 *
 * @param message The challenge text from the server's 334 response.
 * @returns A human-readable description of the failure.
 */
function decodeOAuth2Challenge(message: string): string {
  try {
    const binary = atob(message.trim());
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return message;
  }
}

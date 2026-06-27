import type { SmtpOAuth2Auth, SmtpOAuth2RefreshAuth } from "./config.ts";

/**
 * An error thrown when SMTP authentication fails, including OAuth 2.0 token
 * acquisition and SASL exchange failures.
 *
 * @since 0.5.0
 */
export class SmtpAuthError extends Error {
  /**
   * Creates a new {@link SmtpAuthError}.
   * @param message A human-readable description of the failure.
   */
  constructor(message: string) {
    super(message);
    this.name = "SmtpAuthError";
  }
}

/**
 * Encodes a string as Base64 in a cross-runtime, UTF-8-safe manner.
 *
 * Unlike calling `btoa()` directly, this first encodes the input as UTF-8 so
 * that non-ASCII characters (e.g., in an internationalized address) do not
 * throw.
 *
 * @param input The string to encode.
 * @returns The Base64-encoded representation of the UTF-8 bytes of `input`.
 */
function toBase64(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Builds the SASL `XOAUTH2` initial client response for SMTP authentication.
 *
 * The unencoded payload follows Google's XOAUTH2 format
 * (`user=<user>^Aauth=Bearer <token>^A^A`, where `^A` is the `0x01` control
 * character) and is returned Base64-encoded, ready to be sent as the argument
 * of `AUTH XOAUTH2`.
 *
 * @param user The user (email address) to authenticate as.
 * @param accessToken The OAuth 2.0 access token.
 * @returns The Base64-encoded XOAUTH2 initial client response.
 * @since 0.5.0
 */
export function formatXoauth2(user: string, accessToken: string): string {
  return toBase64(`user=${user}\x01auth=Bearer ${accessToken}\x01\x01`);
}

/**
 * Builds the SASL `OAUTHBEARER` initial client response for SMTP
 * authentication, as defined by [RFC 7628].
 *
 * The unencoded payload is
 * `n,a=<user>,^A[host=<host>^A][port=<port>^A]auth=Bearer <token>^A^A`
 * (where `^A` is the `0x01` control character) and is returned Base64-encoded,
 * ready to be sent as the argument of `AUTH OAUTHBEARER`.
 *
 * [RFC 7628]: https://www.rfc-editor.org/rfc/rfc7628
 *
 * @param user The user (email address) to authenticate as.
 * @param accessToken The OAuth 2.0 access token.
 * @param host The server host to include as the `host` key/value, if any.
 * @param port The server port to include as the `port` key/value, if any.
 * @returns The Base64-encoded OAUTHBEARER initial client response.
 * @since 0.5.0
 */
export function formatOauthbearer(
  user: string,
  accessToken: string,
  host?: string,
  port?: number,
): string {
  let response = `n,a=${escapeSaslName(user)},\x01`;
  if (host != null) response += `host=${host}\x01`;
  if (port != null) response += `port=${port}\x01`;
  response += `auth=Bearer ${accessToken}\x01\x01`;
  return toBase64(response);
}

/**
 * Escapes a SASL name (GS2 `authzid`) per RFC 5801, encoding `,` as `=2C` and
 * `=` as `=3D` so that identities containing those characters do not corrupt
 * the GS2 header.
 *
 * @param name The SASL name to escape.
 * @returns The escaped SASL name.
 */
function escapeSaslName(name: string): string {
  return name.replace(/=/g, "=3D").replace(/,/g, "=2C");
}

/**
 * Chooses an OAuth 2.0 SASL mechanism based on the mechanisms advertised by the
 * server in its `AUTH` capability line.
 *
 * `XOAUTH2` is preferred when available (it is the de-facto standard supported
 * by Gmail and Outlook); otherwise `OAUTHBEARER` is used when advertised.  When
 * neither is advertised, `xoauth2` is returned as a best-effort default.
 *
 * @param capabilities The capability lines parsed from the server's EHLO
 *                     response.
 * @returns The selected mechanism, either `"xoauth2"` or `"oauthbearer"`.
 * @since 0.5.0
 */
export function selectOAuth2Mechanism(
  capabilities: readonly string[],
): "xoauth2" | "oauthbearer" {
  const authLine = capabilities.find((cap) =>
    cap.toUpperCase().startsWith("AUTH")
  );
  const mechanisms = authLine == null
    ? []
    : authLine.toUpperCase().split(/\s+/).slice(1);
  if (mechanisms.includes("XOAUTH2")) return "xoauth2";
  if (mechanisms.includes("OAUTHBEARER")) return "oauthbearer";
  return "xoauth2";
}

/**
 * Validates that an OAuth 2.0 token endpoint is safe to send client credentials
 * to, requiring HTTPS except for loopback addresses (for local testing).
 *
 * @param endpoint The token endpoint URL to validate.
 * @throws {TypeError} If the URL is malformed or uses an insecure scheme.
 */
function assertSecureTokenEndpoint(endpoint: string): void {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new TypeError(
      `Invalid OAuth 2.0 token endpoint URL: ${endpoint}`,
    );
  }
  if (url.protocol === "https:") return;
  const isLoopback = url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "[::1]" ||
    url.hostname === "::1";
  if (url.protocol === "http:" && isLoopback) return;
  throw new TypeError(
    "OAuth 2.0 token endpoint must use HTTPS to protect client credentials: " +
      endpoint,
  );
}

/**
 * The number of milliseconds before a cached access token's expiry at which it
 * is considered stale and eligible for refresh.
 */
const REFRESH_SAFETY_MARGIN_MS = 60_000;

/**
 * The default access token lifetime (in seconds) assumed when the token
 * endpoint omits `expires_in`.
 */
const DEFAULT_EXPIRES_IN = 3600;

/**
 * How long to wait for the token endpoint before aborting the request, so a
 * stalled endpoint cannot block authentication indefinitely.
 */
const TOKEN_REQUEST_TIMEOUT_MS = 60_000;

/** Maximum number of response-body characters to include in error messages. */
const MAX_ERROR_BODY_LENGTH = 500;

/**
 * Truncates a token-endpoint response body so an oversized payload (e.g. a
 * large proxy/CDN error page) does not bloat error messages and logs.
 *
 * @param text The response body text.
 * @returns The text, truncated with an ellipsis if it exceeds the limit.
 */
function truncateErrorBody(text: string): string {
  return text.length > MAX_ERROR_BODY_LENGTH
    ? `${text.slice(0, MAX_ERROR_BODY_LENGTH)}…`
    : text;
}

/**
 * Mirrors a promise but rejects early if the given abort signal fires, without
 * cancelling the underlying promise.  This lets a single waiter abort its own
 * wait on a shared operation without affecting other waiters.
 *
 * @param promise The promise to await.
 * @param signal An optional abort signal that rejects the returned promise.
 * @returns A promise that settles with `promise`, or rejects when `signal`
 *          aborts.
 */
function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (signal == null) return promise;
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    if (signal.aborted) {
      reject(signal.reason);
    } else {
      signal.addEventListener("abort", onAbort, { once: true });
    }
    // Always attach to the underlying promise so its settlement is observed
    // (avoiding unhandled rejections) even after an abort wins the race.
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

/**
 * Acquires and caches OAuth 2.0 access tokens for SMTP authentication.
 *
 * Depending on the {@link SmtpOAuth2Auth} configuration, the manager either
 * returns a static token, invokes a provider callback on every request, or
 * exchanges a refresh token for an access token at the configured token
 * endpoint and caches it until shortly before it expires.  A single manager is
 * shared across all pooled connections of a transport so that the refresh-token
 * exchange happens at most once per token lifetime.
 *
 * @since 0.5.0
 */
export class OAuth2TokenManager {
  private readonly auth: SmtpOAuth2Auth;
  private readonly fetchFn: typeof fetch;
  private cached?: { accessToken: string; expiresAt: number };
  private pending?: Promise<{ accessToken: string; expiresIn: number }>;

  /**
   * Creates a new {@link OAuth2TokenManager}.
   *
   * @param auth The OAuth 2.0 authentication configuration.
   * @param fetchFn The `fetch` implementation to use for the refresh-token
   *                exchange.  Defaults to the global `fetch`; primarily
   *                overridden in tests.
   * @throws {TypeError} If a refresh-token configuration has an insecure
   *                     (non-HTTPS) token endpoint.
   */
  constructor(auth: SmtpOAuth2Auth, fetchFn: typeof fetch = fetch) {
    if ("refreshToken" in auth) {
      assertSecureTokenEndpoint(auth.tokenEndpoint);
    }
    this.auth = auth;
    this.fetchFn = fetchFn;
  }

  /**
   * Returns a valid OAuth 2.0 access token, acquiring or refreshing it as
   * needed.
   *
   * @param signal An optional {@link AbortSignal} to cancel token acquisition.
   * @returns The current access token.
   * @throws {SmtpAuthError} If a refresh-token exchange fails or returns an
   *                         unexpected response.
   */
  async getAccessToken(signal?: AbortSignal): Promise<string> {
    signal?.throwIfAborted();

    const auth = this.auth;
    if ("accessToken" in auth) {
      return typeof auth.accessToken === "function"
        ? await auth.accessToken(signal)
        : auth.accessToken;
    }

    const cached = this.cached;
    if (
      cached != null && cached.expiresAt - REFRESH_SAFETY_MARGIN_MS > Date.now()
    ) {
      return cached.accessToken;
    }

    // Coalesce concurrent refreshes so the token endpoint is hit at most once
    // per token lifetime.  The shared request is not tied to any single caller's
    // abort signal; each caller instead races it against its own signal so that
    // one caller's cancellation cannot fail the others.
    this.pending ??= this.refresh(auth)
      .then((result) => {
        // Populate the cache before `finally` clears `pending`, so a concurrent
        // caller in the microtask gap finds the fresh token instead of starting
        // a duplicate refresh.
        this.cached = {
          accessToken: result.accessToken,
          expiresAt: Date.now() + result.expiresIn * 1000,
        };
        return result;
      })
      .finally(() => {
        this.pending = undefined;
      });

    const { accessToken } = await abortable(this.pending, signal);
    return accessToken;
  }

  /**
   * Exchanges the configured refresh token for a fresh access token.
   *
   * The request deliberately runs without a caller-specific abort signal; it is
   * shared across concurrent callers, each of which applies its own
   * cancellation separately (see {@link getAccessToken}).
   *
   * @param auth The refresh-token authentication configuration.
   * @returns The new access token and its lifetime in seconds.
   * @throws {SmtpAuthError} If the request fails or the response is invalid.
   */
  private async refresh(
    auth: SmtpOAuth2RefreshAuth,
  ): Promise<{ accessToken: string; expiresIn: number }> {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: auth.clientId,
      refresh_token: auth.refreshToken,
    });
    if (auth.clientSecret != null) body.set("client_secret", auth.clientSecret);
    if (auth.scope != null) body.set("scope", auth.scope);

    // Bound the request with an internal timeout so a stalled endpoint cannot
    // leave the shared `pending` promise unresolved forever.
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort(new Error("OAuth 2.0 token request timed out"));
    }, TOKEN_REQUEST_TIMEOUT_MS);

    let response: Response;
    let text: string;
    try {
      response = await this.fetchFn(auth.tokenEndpoint, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "accept": "application/json",
        },
        body,
        signal: controller.signal,
      });
      // Read the body under the same timeout: an endpoint that returns headers
      // but stalls on the body must not leave `pending` unresolved forever.
      text = await response.text();
    } catch (cause) {
      throw new SmtpAuthError(
        `Failed to request an OAuth 2.0 access token from ` +
          `${auth.tokenEndpoint}: ` +
          `${cause instanceof Error ? cause.message : String(cause)}`,
      );
    } finally {
      clearTimeout(timeout);
    }

    const safeText = truncateErrorBody(text);
    if (!response.ok) {
      throw new SmtpAuthError(
        `OAuth 2.0 token endpoint responded with HTTP ${response.status}: ${safeText}`,
      );
    }

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new SmtpAuthError(
        `OAuth 2.0 token endpoint returned a non-JSON response: ${safeText}`,
      );
    }

    if (
      typeof json !== "object" || json == null ||
      typeof (json as Record<string, unknown>).access_token !== "string"
    ) {
      throw new SmtpAuthError(
        `OAuth 2.0 token endpoint response did not include an access_token: ${safeText}`,
      );
    }

    const record = json as Record<string, unknown>;
    // Most providers return `expires_in` as a number, but some return it as a
    // numeric string; parse that rather than falling back to the default.
    let expiresIn = DEFAULT_EXPIRES_IN;
    if (typeof record.expires_in === "number") {
      expiresIn = record.expires_in;
    } else if (typeof record.expires_in === "string") {
      const parsed = Number.parseInt(record.expires_in, 10);
      if (Number.isFinite(parsed)) expiresIn = parsed;
    }
    return { accessToken: record.access_token as string, expiresIn };
  }
}

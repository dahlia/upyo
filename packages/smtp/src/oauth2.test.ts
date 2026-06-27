import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { SmtpOAuth2RefreshAuth, SmtpOAuth2TokenAuth } from "./config.ts";
import {
  formatOauthbearer,
  formatXoauth2,
  OAuth2TokenManager,
  selectOAuth2Mechanism,
  SmtpAuthError,
} from "./oauth2.ts";

// Decodes a base64 string back to its raw bytes as a Latin-1 string so that the
// 0x01 (^A) separators are preserved for assertions.
function decodeBase64(value: string): string {
  const binary = atob(value);
  return binary;
}

describe("formatXoauth2()", () => {
  test("matches the published Google XOAUTH2 vector", () => {
    // From https://developers.google.com/workspace/gmail/imap/xoauth2-protocol
    const result = formatXoauth2(
      "someuser@example.com",
      "ya29.vF9dft4qmTc2Nvb3RlckBhdHRhdmlzdGEuY29tCg",
    );
    assert.equal(
      result,
      "dXNlcj1zb21ldXNlckBleGFtcGxlLmNvbQFhdXRoPUJlYXJlciB5YTI5LnZGOWRm" +
        "dDRxbVRjMk52YjNSbGNrQmhkSFJoZG1semRHRXVZMjl0Q2cBAQ==",
    );
  });

  test("produces the documented control-character layout", () => {
    const decoded = decodeBase64(formatXoauth2("u@e.com", "tok"));
    assert.equal(decoded, "user=u@e.com\x01auth=Bearer tok\x01\x01");
  });

  test("encodes non-ASCII users without throwing", () => {
    const decoded = decodeBase64(formatXoauth2("관리자@example.com", "tok"));
    // UTF-8 bytes of the Hangul characters must be preserved.
    const expected = new TextEncoder().encode(
      "user=관리자@example.com\x01auth=Bearer tok\x01\x01",
    );
    const actual = Uint8Array.from(decoded, (c) => c.charCodeAt(0));
    assert.deepEqual(actual, expected);
  });
});

describe("formatOauthbearer()", () => {
  test("matches the RFC 7628 OAUTHBEARER vector", () => {
    // From RFC 7628 §4.1.
    const result = formatOauthbearer(
      "user@example.com",
      "vF9dft4qmTc2Nvb3RlckBhbHRhdmlzdGEuY29tCg==",
      "server.example.com",
      587,
    );
    assert.equal(
      result,
      "bixhPXVzZXJAZXhhbXBsZS5jb20sAWhvc3Q9c2VydmVyLmV4YW1wbGUuY29tAXBv" +
        "cnQ9NTg3AWF1dGg9QmVhcmVyIHZGOWRmdDRxbVRjMk52YjNSbGNrQmhiSFJoZG1s" +
        "emRHRXVZMjl0Q2c9PQEB",
    );
  });

  test("omits host and port when not provided", () => {
    const decoded = decodeBase64(formatOauthbearer("u@e.com", "tok"));
    assert.equal(decoded, "n,a=u@e.com,\x01auth=Bearer tok\x01\x01");
  });

  test("escapes commas and equals signs in the authzid", () => {
    const decoded = decodeBase64(formatOauthbearer("a,b=c@example.com", "tok"));
    assert.equal(
      decoded,
      "n,a=a=2Cb=3Dc@example.com,\x01auth=Bearer tok\x01\x01",
    );
  });
});

describe("selectOAuth2Mechanism()", () => {
  test("prefers XOAUTH2 when both are advertised", () => {
    assert.equal(
      selectOAuth2Mechanism(["AUTH PLAIN LOGIN XOAUTH2 OAUTHBEARER", "HELP"]),
      "xoauth2",
    );
  });

  test("falls back to OAUTHBEARER when XOAUTH2 is absent", () => {
    assert.equal(
      selectOAuth2Mechanism(["AUTH PLAIN OAUTHBEARER"]),
      "oauthbearer",
    );
  });

  test("defaults to xoauth2 when neither is advertised", () => {
    assert.equal(selectOAuth2Mechanism(["AUTH PLAIN LOGIN"]), "xoauth2");
    assert.equal(selectOAuth2Mechanism([]), "xoauth2");
  });
});

describe("OAuth2TokenManager", () => {
  test("returns a static access token verbatim", async () => {
    const auth: SmtpOAuth2TokenAuth = {
      user: "u@e.com",
      accessToken: "static-token",
    };
    const manager = new OAuth2TokenManager(auth);
    assert.equal(await manager.getAccessToken(), "static-token");
  });

  test("invokes a synchronous token provider", async () => {
    let calls = 0;
    const auth: SmtpOAuth2TokenAuth = {
      user: "u@e.com",
      accessToken: () => {
        calls++;
        return "provided";
      },
    };
    const manager = new OAuth2TokenManager(auth);
    assert.equal(await manager.getAccessToken(), "provided");
    await manager.getAccessToken();
    assert.equal(calls, 2, "provider is called for every authentication");
  });

  test("invokes an asynchronous token provider", async () => {
    const auth: SmtpOAuth2TokenAuth = {
      user: "u@e.com",
      accessToken: () => Promise.resolve("async-token"),
    };
    const manager = new OAuth2TokenManager(auth);
    assert.equal(await manager.getAccessToken(), "async-token");
  });

  test("exchanges a refresh token and caches the result", async () => {
    let calls = 0;
    let lastBody: URLSearchParams | undefined;
    const fetchFn: typeof fetch = (_input, init) => {
      calls++;
      lastBody = init?.body as URLSearchParams;
      return Promise.resolve(
        new Response(
          JSON.stringify({ access_token: "fresh-token", expires_in: 3600 }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    };
    const auth: SmtpOAuth2RefreshAuth = {
      user: "u@e.com",
      clientId: "client-id",
      clientSecret: "client-secret",
      refreshToken: "refresh-token",
      tokenEndpoint: "https://oauth2.example.com/token",
      scope: "https://mail.google.com/",
    };
    const manager = new OAuth2TokenManager(auth, fetchFn);

    assert.equal(await manager.getAccessToken(), "fresh-token");
    assert.equal(calls, 1);
    assert.equal(lastBody?.get("grant_type"), "refresh_token");
    assert.equal(lastBody?.get("client_id"), "client-id");
    assert.equal(lastBody?.get("client_secret"), "client-secret");
    assert.equal(lastBody?.get("refresh_token"), "refresh-token");
    assert.equal(lastBody?.get("scope"), "https://mail.google.com/");

    // Second call within the validity window must reuse the cached token.
    assert.equal(await manager.getAccessToken(), "fresh-token");
    assert.equal(calls, 1, "cached token is reused; no second fetch");
  });

  test("calls fetchFn without binding it to the manager", async () => {
    const receivers: unknown[] = [];
    function recordingFetch(this: unknown): Promise<Response> {
      receivers.push(this);
      return Promise.resolve(
        new Response(
          JSON.stringify({ access_token: "t", expires_in: 3600 }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    }
    const auth: SmtpOAuth2RefreshAuth = {
      user: "u@e.com",
      clientId: "client-id",
      refreshToken: "refresh-token",
      tokenEndpoint: "https://oauth2.example.com/token",
    };
    const manager = new OAuth2TokenManager(auth, recordingFetch);
    await manager.getAccessToken();

    // The native fetch throws "Illegal invocation" if called as a method, so
    // it must be invoked unbound (receiver undefined), not as `this.fetchFn`.
    assert.equal(receivers[0], undefined);
  });

  test("refetches when the cached token is (near) expiry", async () => {
    let calls = 0;
    const fetchFn: typeof fetch = () => {
      calls++;
      return Promise.resolve(
        new Response(
          JSON.stringify({ access_token: `t${calls}`, expires_in: 0 }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    };
    const auth: SmtpOAuth2RefreshAuth = {
      user: "u@e.com",
      clientId: "client-id",
      refreshToken: "refresh-token",
      tokenEndpoint: "https://oauth2.example.com/token",
    };
    const manager = new OAuth2TokenManager(auth, fetchFn);

    assert.equal(await manager.getAccessToken(), "t1");
    assert.equal(await manager.getAccessToken(), "t2");
    assert.equal(calls, 2);
  });

  test("coalesces concurrent refreshes into a single request", async () => {
    let calls = 0;
    const fetchFn: typeof fetch = () => {
      calls++;
      return new Promise<Response>((resolve) =>
        setTimeout(
          () =>
            resolve(
              new Response(
                JSON.stringify({
                  access_token: "shared-token",
                  expires_in: 3600,
                }),
                {
                  status: 200,
                  headers: { "content-type": "application/json" },
                },
              ),
            ),
          10,
        )
      );
    };
    const auth: SmtpOAuth2RefreshAuth = {
      user: "u@e.com",
      clientId: "client-id",
      refreshToken: "refresh-token",
      tokenEndpoint: "https://oauth2.example.com/token",
    };
    const manager = new OAuth2TokenManager(auth, fetchFn);

    const tokens = await Promise.all([
      manager.getAccessToken(),
      manager.getAccessToken(),
      manager.getAccessToken(),
    ]);
    assert.deepEqual(tokens, ["shared-token", "shared-token", "shared-token"]);
    assert.equal(
      calls,
      1,
      "concurrent refreshes are coalesced into one request",
    );
  });

  test("throws SmtpAuthError on a non-OK token response", async () => {
    const fetchFn: typeof fetch = () =>
      Promise.resolve(
        new Response(JSON.stringify({ error: "invalid_grant" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
      );
    const auth: SmtpOAuth2RefreshAuth = {
      user: "u@e.com",
      clientId: "client-id",
      refreshToken: "refresh-token",
      tokenEndpoint: "https://oauth2.example.com/token",
    };
    const manager = new OAuth2TokenManager(auth, fetchFn);
    await assert.rejects(
      manager.getAccessToken(),
      (error: unknown) =>
        error instanceof SmtpAuthError && /invalid_grant/.test(error.message),
    );
  });

  test("parses a string expires_in", async () => {
    let calls = 0;
    const fetchFn: typeof fetch = () => {
      calls++;
      return Promise.resolve(
        new Response(
          JSON.stringify({ access_token: `t${calls}`, expires_in: "0" }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    };
    const auth: SmtpOAuth2RefreshAuth = {
      user: "u@e.com",
      clientId: "client-id",
      refreshToken: "refresh-token",
      tokenEndpoint: "https://oauth2.example.com/token",
    };
    const manager = new OAuth2TokenManager(auth, fetchFn);

    // "0" must parse to an immediate expiry, forcing a second fetch.
    assert.equal(await manager.getAccessToken(), "t1");
    assert.equal(await manager.getAccessToken(), "t2");
    assert.equal(calls, 2);
  });

  test("falls back to the default lifetime for invalid expires_in", async () => {
    for (const expiresIn of [-100, "100abc", "-5", null]) {
      let calls = 0;
      const fetchFn: typeof fetch = () => {
        calls++;
        return Promise.resolve(
          new Response(
            JSON.stringify({ access_token: "t", expires_in: expiresIn }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        );
      };
      const auth: SmtpOAuth2RefreshAuth = {
        user: "u@e.com",
        clientId: "client-id",
        refreshToken: "refresh-token",
        tokenEndpoint: "https://oauth2.example.com/token",
      };
      const manager = new OAuth2TokenManager(auth, fetchFn);

      // An invalid value yields the default (~1h) lifetime, so the cached token
      // is reused and there is no second fetch.
      await manager.getAccessToken();
      await manager.getAccessToken();
      assert.equal(
        calls,
        1,
        `expires_in=${
          JSON.stringify(expiresIn)
        } should use the default lifetime`,
      );
    }
  });

  test("truncates an oversized error response body", async () => {
    const fetchFn: typeof fetch = () =>
      Promise.resolve(new Response("E".repeat(5000), { status: 502 }));
    const auth: SmtpOAuth2RefreshAuth = {
      user: "u@e.com",
      clientId: "client-id",
      refreshToken: "refresh-token",
      tokenEndpoint: "https://oauth2.example.com/token",
    };
    const manager = new OAuth2TokenManager(auth, fetchFn);
    await assert.rejects(
      manager.getAccessToken(),
      (error: unknown) =>
        error instanceof SmtpAuthError &&
        error.message.includes("…") &&
        error.message.length < 700,
    );
  });

  test("rejects when the abort signal is already aborted", async () => {
    const auth: SmtpOAuth2TokenAuth = {
      user: "u@e.com",
      accessToken: "static-token",
    };
    const manager = new OAuth2TokenManager(auth);
    await assert.rejects(
      manager.getAccessToken(AbortSignal.abort()),
      (error: unknown) =>
        error instanceof DOMException && error.name === "AbortError",
    );
  });

  test("preserves abort errors during the refresh request", async () => {
    const controller = new AbortController();
    const fetchFn: typeof fetch = () => {
      // Simulate the request being aborted mid-flight.
      controller.abort();
      return Promise.reject(
        new DOMException("The operation was aborted.", "AbortError"),
      );
    };
    const auth: SmtpOAuth2RefreshAuth = {
      user: "u@e.com",
      clientId: "client-id",
      refreshToken: "refresh-token",
      tokenEndpoint: "https://oauth2.example.com/token",
    };
    const manager = new OAuth2TokenManager(auth, fetchFn);
    await assert.rejects(
      manager.getAccessToken(controller.signal),
      (error: unknown) =>
        error instanceof DOMException && error.name === "AbortError",
    );
  });

  test("rejects an insecure (non-HTTPS) token endpoint", () => {
    assert.throws(
      () =>
        new OAuth2TokenManager({
          user: "u@e.com",
          clientId: "client-id",
          refreshToken: "refresh-token",
          tokenEndpoint: "http://oauth2.example.com/token",
        }),
      TypeError,
    );
  });

  test("allows HTTPS and loopback HTTP token endpoints", () => {
    for (
      const tokenEndpoint of [
        "https://oauth2.example.com/token",
        "http://localhost:8080/token",
        "http://127.0.0.1:8080/token",
        "http://[::1]:8080/token",
      ]
    ) {
      const manager = new OAuth2TokenManager({
        user: "u@e.com",
        clientId: "client-id",
        refreshToken: "refresh-token",
        tokenEndpoint,
      });
      assert.ok(manager instanceof OAuth2TokenManager);
    }
  });
});

import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { JmapHttpClient } from "./http-client.ts";
import { createJmapConfig } from "./config.ts";
import { JmapApiError } from "./errors.ts";

describe("JmapHttpClient", () => {
  const config = createJmapConfig({
    sessionUrl: "https://jmap.example.com/.well-known/jmap",
    bearerToken: "test-token",
    retries: 0, // Disable retries for tests
    timeout: 1000,
  });

  describe("constructor", () => {
    it("should create an instance with config", () => {
      const client = new JmapHttpClient(config);
      assert.ok(client);
    });
  });

  describe("fetchSession", () => {
    it("should fetch session with Bearer token auth", async () => {
      const originalFetch = globalThis.fetch;

      try {
        const captured: { headers: Headers | null } = { headers: null };

        globalThis.fetch = (
          _input: RequestInfo | URL,
          init?: RequestInit,
        ): Promise<Response> => {
          captured.headers = new Headers(init?.headers);
          return Promise.resolve(
            new Response(
              JSON.stringify({
                capabilities: {},
                accounts: {
                  "acc-1": {
                    name: "Test",
                    isPersonal: true,
                    isReadOnly: false,
                    accountCapabilities: { "urn:ietf:params:jmap:mail": {} },
                  },
                },
                primaryAccounts: {},
                username: "test@example.com",
                apiUrl: "https://jmap.example.com/api",
                downloadUrl: "https://jmap.example.com/download/{blobId}",
                uploadUrl: "https://jmap.example.com/upload/{accountId}",
                state: "123",
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            ),
          );
        };

        const client = new JmapHttpClient(config);
        const session = await client.fetchSession();

        assert.ok(captured.headers);
        assert.equal(
          captured.headers.get("Authorization"),
          "Bearer test-token",
        );
        assert.equal(session.apiUrl, "https://jmap.example.com/api");
        assert.ok(session.accounts["acc-1"]);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("should throw JmapApiError on HTTP error", async () => {
      const originalFetch = globalThis.fetch;

      try {
        globalThis.fetch = (): Promise<Response> => {
          return Promise.resolve(new Response("Unauthorized", { status: 401 }));
        };

        const client = new JmapHttpClient(config);

        await assert.rejects(
          async () => await client.fetchSession(),
          (error: unknown) => {
            assert.ok(error instanceof JmapApiError);
            assert.equal(error.statusCode, 401);
            return true;
          },
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe("executeRequest", () => {
    it("should send JMAP request with proper structure", async () => {
      const originalFetch = globalThis.fetch;

      try {
        let capturedBody: unknown = null;

        globalThis.fetch = (
          _input: RequestInfo | URL,
          init?: RequestInit,
        ): Promise<Response> => {
          if (init?.body) {
            capturedBody = JSON.parse(init.body as string);
          }
          return Promise.resolve(
            new Response(
              JSON.stringify({
                methodResponses: [["Email/set", {
                  created: { draft: { id: "email-1" } },
                }, "c0"]],
                sessionState: "state-1",
              }),
              { status: 200 },
            ),
          );
        };

        const client = new JmapHttpClient(config);
        const response = await client.executeRequest(
          "https://jmap.example.com/api",
          {
            using: ["urn:ietf:params:jmap:core"],
            methodCalls: [["Email/set", { accountId: "acc-1" }, "c0"]],
          },
        );

        assert.ok(capturedBody);
        assert.deepEqual((capturedBody as { using: string[] }).using, [
          "urn:ietf:params:jmap:core",
        ]);
        assert.ok(response.methodResponses);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("should throw on 4xx errors without retry", async () => {
      const originalFetch = globalThis.fetch;
      let fetchCount = 0;

      try {
        globalThis.fetch = (): Promise<Response> => {
          fetchCount++;
          return Promise.resolve(new Response("Bad Request", { status: 400 }));
        };

        const clientWithRetries = new JmapHttpClient(
          createJmapConfig({
            sessionUrl: "https://jmap.example.com/.well-known/jmap",
            bearerToken: "test-token",
            retries: 3,
          }),
        );

        await assert.rejects(
          async () =>
            await clientWithRetries.executeRequest(
              "https://jmap.example.com/api",
              { using: [], methodCalls: [] },
            ),
          JmapApiError,
        );

        // Should not retry on 4xx errors
        assert.equal(fetchCount, 1);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe("abort signal", () => {
    it("should abort request when signal is aborted", async () => {
      const controller = new AbortController();
      controller.abort();

      const client = new JmapHttpClient(config);

      await assert.rejects(
        async () => await client.fetchSession(controller.signal),
        (error: unknown) => {
          return error instanceof Error &&
            (error.name === "AbortError" ||
              error.message.includes("aborted") ||
              error.message.includes("abort"));
        },
      );
    });
  });
});

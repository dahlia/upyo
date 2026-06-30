import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import type { Message, Priority } from "@upyo/core";
import { JmapTransport } from "./jmap-transport.ts";

const baseMessage: Message = {
  sender: { address: "sender@example.com" as `${string}@${string}` },
  recipients: [
    { address: "recipient@example.com" as `${string}@${string}` },
  ],
  ccRecipients: [],
  bccRecipients: [],
  replyRecipients: [],
  attachments: [],
  subject: "Test Subject",
  content: { text: "Hello, World!" },
  priority: "normal" as Priority,
  tags: [],
  headers: new Headers(),
};

describe("JmapTransport", () => {
  describe("constructor", () => {
    it("should create transport with config", () => {
      const transport = new JmapTransport({
        sessionUrl: "https://jmap.example.com/.well-known/jmap",
        bearerToken: "test-token",
      });

      assert.ok(transport);
      assert.equal(
        transport.config.sessionUrl,
        "https://jmap.example.com/.well-known/jmap",
      );
    });
  });

  describe("send", () => {
    it("should reject already-aborted signals", async () => {
      const controller = new AbortController();
      controller.abort();

      const transport = new JmapTransport({
        sessionUrl: "https://jmap.example.com/.well-known/jmap",
        bearerToken: "test-token",
      });

      await assert.rejects(
        () => transport.send(baseMessage, { signal: controller.signal }),
        (error: unknown) =>
          error instanceof Error && error.name === "AbortError",
      );
    });

    it("should reject already-aborted signals with custom reasons", async () => {
      const controller = new AbortController();
      controller.abort("stop");

      const transport = new JmapTransport({
        sessionUrl: "https://jmap.example.com/.well-known/jmap",
        bearerToken: "test-token",
      });

      await assert.rejects(
        () => transport.send(baseMessage, { signal: controller.signal }),
        (error: unknown) => error === "stop",
      );
    });

    it("should reject caller aborts during fetch", async () => {
      const originalFetch = globalThis.fetch;
      const controller = new AbortController();

      try {
        globalThis.fetch = (
          _input: RequestInfo | URL,
          init?: RequestInit,
        ): Promise<Response> =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(
                new DOMException(
                  "The operation was aborted.",
                  "AbortError",
                ),
              );
            }, { once: true });
            setTimeout(() => controller.abort(), 0);
          });

        const transport = new JmapTransport({
          sessionUrl: "https://jmap.example.com/.well-known/jmap",
          bearerToken: "test-token",
          retries: 0,
        });

        await assert.rejects(
          () => transport.send(baseMessage, { signal: controller.signal }),
          (error: unknown) =>
            error instanceof Error && error.name === "AbortError",
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("should reject caller aborts with AbortError without a reason", async () => {
      const originalFetch = globalThis.fetch;
      const controller = new AbortController();
      Object.defineProperty(controller.signal, "reason", {
        value: undefined,
      });

      try {
        globalThis.fetch = (
          _input: RequestInfo | URL,
          init?: RequestInit,
        ): Promise<Response> =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(undefined);
            }, { once: true });
            setTimeout(() => controller.abort(), 0);
          });

        const transport = new JmapTransport({
          sessionUrl: "https://jmap.example.com/.well-known/jmap",
          bearerToken: "test-token",
          retries: 0,
        });

        await assert.rejects(
          () => transport.send(baseMessage, { signal: controller.signal }),
          (error: unknown) =>
            error instanceof Error && error.name === "AbortError",
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe("sendMany", () => {
    it("should reject already-aborted signals with custom reasons", async () => {
      const controller = new AbortController();
      controller.abort("stop");

      const transport = new JmapTransport({
        sessionUrl: "https://jmap.example.com/.well-known/jmap",
        bearerToken: "test-token",
      });

      await assert.rejects(
        async () => {
          for await (
            const _receipt of transport.sendMany([baseMessage], {
              signal: controller.signal,
            })
          ) {
            // Consume the async iterable to trigger sendMany().
          }
        },
        (error: unknown) => error === "stop",
      );
    });
  });
});

// Note: Complex tests with fetch mocking are in separate files:
// - send-success.test.ts (successful send test)
// - send-error.test.ts (error handling test)
// - sendmany.test.ts (sendMany tests)
// This avoids test interference issues with globalThis.fetch mocking

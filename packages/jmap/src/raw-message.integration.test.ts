import assert from "node:assert/strict";
import { test } from "node:test";
import { Buffer } from "node:buffer";
import { createServer } from "node:http";
import type { Socket } from "node:net";
import { JmapTransport } from "./jmap-transport.ts";
import { isRawTransport, type RawMessage } from "@upyo/core";

const core = "urn:ietf:params:jmap:core";
const mail = "urn:ietf:params:jmap:mail";
const submission = "urn:ietf:params:jmap:submission";
const content = Buffer.from(
  "From: sender@example.com\r\nBcc: hidden@example.com\r\nMessage-ID: <preserved@example.com>\r\nDKIM-Signature: original\r\n folded\r\nContent-Type: application/pkcs7-mime\r\n\r\n.opaque\r\n",
);
const raw: RawMessage = {
  envelope: { from: "sender@example.com", to: ["recipient@example.com"] },
  content,
  encoding: "7bit",
};
interface ServerOptions {
  readonly httpError?: {
    readonly stage: "upload" | "import" | "submission";
    readonly status: number;
    readonly body: string;
  };
  readonly upload?: "early" | "wrong-size" | "stall-response";
  readonly discovery?: {
    readonly method: "Mailbox/get" | "Identity/get";
    readonly fault: "account" | "call" | "duplicate" | "identifier";
  };
  readonly importing?:
    | "partial"
    | "lost"
    | "reject"
    | "duplicate"
    | "different-blob";
  readonly submitting?:
    | "partial"
    | "method-error"
    | "lost"
    | "missing"
    | "reject"
    | "contradictory"
    | "request-error"
    | "stall-response";
  readonly slowUpload?: boolean;
  readonly timeout?: number;
}
async function setup(options: ServerOptions = {}) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const uploads: Buffer[] = [];
  const uploadContentTypes: (string | undefined)[] = [];
  const uploadsAtImport: number[] = [];
  const sockets = new Set<Socket>();
  let base = "";
  const server = createServer(async (req, res) => {
    req.on("error", () => {});
    const reply = (body: unknown, status = 200) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };
    const httpError = (stage: "upload" | "import" | "submission") => {
      if (options.httpError?.stage !== stage) return false;
      res.writeHead(options.httpError.status, {
        "Content-Type": "text/plain",
        "Retry-After": "7",
      });
      res.end(options.httpError.body);
      return true;
    };
    if (req.url === "/session") {
      reply({
        capabilities: { [core]: {}, [mail]: {}, [submission]: {} },
        accounts: {
          a: { accountCapabilities: { [mail]: {}, [submission]: {} } },
        },
        primaryAccounts: { [mail]: "a" },
        apiUrl: base + "/api",
        uploadUrl: base + "/upload/{accountId}",
        downloadUrl: base + "/download/{blobId}",
        state: "s",
      });
      return;
    }
    if (req.url?.startsWith("/upload/")) {
      uploadContentTypes.push(req.headers["content-type"]);
      if (options.upload === "early") {
        if (httpError("upload")) return;
        reply({ accountId: "a", blobId: "blob", size: 0 });
        return;
      }
      if (options.slowUpload) {
        req.pause();
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, 300);
          req.once("close", () => {
            clearTimeout(timer);
            resolve();
          });
        });
        req.resume();
      }
      const chunks: Buffer[] = [];
      try {
        for await (const chunk of req) chunks.push(Buffer.from(chunk));
      } catch {
        return;
      }
      const bytes = Buffer.concat(chunks);
      uploads.push(bytes);
      if (httpError("upload")) return;
      if (options.upload === "stall-response") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.flushHeaders();
        res.write("{");
        return;
      }
      reply({
        accountId: "a",
        blobId: "blob",
        type: "message/rfc822",
        size: bytes.length + (options.upload === "wrong-size" ? 1 : 0),
      });
      return;
    }
    const chunks: Buffer[] = [];
    try {
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
    } catch {
      return;
    }
    const request = JSON.parse(Buffer.concat(chunks).toString()) as {
      methodCalls: [string, Record<string, unknown>, string][];
    };
    const [name, args, id] = request.methodCalls[0];
    calls.push({ name, args });
    const result: Record<string, unknown> = { accountId: "a" };
    if (name === "Mailbox/get") {
      result.list = [{ id: "drafts", role: "drafts" }];
    } else if (name === "Identity/get") {
      result.list = [{ id: "first", email: "other@example.com" }, {
        id: "matching",
        email: "sender@example.com",
      }];
    } else if (name === "Email/import") {
      uploadsAtImport.push(uploads.length);
      if (httpError("import")) return;
      if (options.importing === "partial") {
        reply({
          methodResponses: [["error", { type: "serverPartialFail" }, id]],
        });
        return;
      }
      if (options.importing === "lost") {
        req.socket.destroy();
        return;
      }
      if (options.importing === "reject") {
        result.notCreated = {
          raw: { type: "invalidEmail", description: "invalid" },
        };
      } else if (
        options.importing === "duplicate" ||
        options.importing === "different-blob"
      ) {
        result.notCreated = {
          raw: { type: "alreadyExists", existingId: "existing" },
        };
      } else result.created = { raw: { id: "email", blobId: "blob" } };
    } else if (name === "Email/get") {
      result.list = [{
        id: "existing",
        blobId: options.importing === "different-blob" ? "old-blob" : "blob",
      }];
    } else if (name === "EmailSubmission/set") {
      if (httpError("submission")) return;
      if (
        options.submitting === "partial" ||
        options.submitting === "method-error"
      ) {
        reply({
          methodResponses: [["error", {
            type: options.submitting === "partial"
              ? "serverPartialFail"
              : "forbidden",
          }, id]],
        });
        return;
      }
      if (options.submitting === "lost") {
        req.socket.destroy();
        return;
      }
      if (options.submitting === "stall-response") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.flushHeaders();
        res.write("{");
        return;
      }
      if (options.submitting === "request-error") {
        reply(
          { type: "urn:ietf:params:jmap:error:notRequest", status: 400 },
          400,
        );
        return;
      }
      if (options.submitting === "missing") {
        reply({ methodResponses: [] });
        return;
      }
      if (options.submitting !== "reject") {
        result.created = { raw: { id: "submission" } };
      }
      if (
        options.submitting === "reject" ||
        options.submitting === "contradictory"
      ) result.notCreated = { raw: { type: "forbidden" } };
    }
    if (options.discovery?.method === name) {
      if (options.discovery.fault === "account") result.accountId = "wrong";
      if (options.discovery.fault === "call") {
        reply({ methodResponses: [[name, result, "wrong"]] });
        return;
      }
      if (options.discovery.fault === "duplicate") {
        reply({ methodResponses: [[name, result, id], [name, result, id]] });
        return;
      }
      if (options.discovery.fault === "identifier") {
        result.list = name === "Mailbox/get"
          ? [{ role: "drafts", id: 42 }]
          : [{ id: 42, email: "sender@example.com" }];
      }
    }
    reply({ methodResponses: [[name, result, id]] });
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  base = `http://127.0.0.1:${address.port}`;
  const transport = new JmapTransport({
    sessionUrl: base + "/session",
    bearerToken: "local-test",
    timeout: options.timeout ?? 2000,
    retries: 3,
  });
  return {
    transport,
    calls,
    uploads,
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      // close() is awaited by each test, so assertion failures reach its runner.
      for (const contentType of uploadContentTypes) {
        assert.equal(contentType, "message/rfc822");
      }
      for (const count of uploadsAtImport) {
        assert.equal(count, 1, "must finish upload before importing");
      }
    },
  };
}

for (const encoding of ["7bit", undefined] as const) {
  test(`JMAP raw uses ${encoding ? "one traversal" : "analysis and transmission"}`, async () => {
    const context = await setup();
    let opens = 0;
    try {
      assert.ok(isRawTransport(context.transport));
      const receipt = await context.transport.sendRaw({
        ...raw,
        encoding,
        content: async function* () {
          opens++;
          for (let i = 0; i < content.length; i += 7) {
            yield content.subarray(i, i + 7);
          }
        },
      });
      assert.ok(receipt.successful, JSON.stringify(receipt));
      assert.equal(receipt.messageId, "submission");
      assert.equal(opens, encoding ? 1 : 2);
      assert.deepEqual(context.uploads, [content]);
      const imported = context.calls.find((c) => c.name === "Email/import")!;
      assert.deepEqual(imported.args.emails, {
        raw: { blobId: "blob", mailboxIds: { drafts: true } },
      });
      const sent = context.calls.find((c) => c.name === "EmailSubmission/set")!;
      assert.deepEqual(sent.args.create, {
        raw: {
          emailId: "email",
          identityId: "matching",
          envelope: {
            mailFrom: { email: "sender@example.com" },
            rcptTo: [{ email: "recipient@example.com" }],
          },
        },
      });
    } finally {
      await context.close();
    }
  });
}

for (
  const mode of [
    "lost",
    "missing",
    "reject",
    "contradictory",
    "request-error",
    "stall-response",
    "partial",
    "method-error",
  ] as const
) {
  test(`JMAP raw submission ${mode} has safe retry classification`, async () => {
    const context = await setup({ submitting: mode, timeout: 200 });
    try {
      const receipt = await context.transport.sendRaw(raw);
      assert.ok(!receipt.successful);
      assert.equal(receipt.retryable, false);
      assert.equal(
        receipt.errors?.[0].code,
        mode === "reject" || mode === "request-error" || mode === "method-error"
          ? "jmap.raw_submission_failed"
          : "jmap.raw_submission_unknown",
      );
      assert.equal(
        context.calls.filter((c) => c.name === "EmailSubmission/set").length,
        1,
      );
    } finally {
      await context.close();
    }
  });
}

for (
  const mode of [
    "lost",
    "reject",
    "duplicate",
    "different-blob",
    "partial",
  ] as const
) {
  test(`JMAP raw import ${mode} never reuses a different blob`, async () => {
    const context = await setup({ importing: mode });
    try {
      const receipt = await context.transport.sendRaw(raw);
      if (mode === "duplicate") {
        assert.ok(receipt.successful, JSON.stringify(receipt));
      } else {
        assert.ok(!receipt.successful);
        assert.equal(receipt.errors?.[0].code, "jmap.raw_import_failed");
        assert.equal(receipt.retryable, mode === "lost" || mode === "partial");
        assert.ok(!context.calls.some((c) => c.name === "EmailSubmission/set"));
      }
      assert.equal(
        context.calls.filter((c) => c.name === "Email/import").length,
        1,
      );
    } finally {
      await context.close();
    }
  });
}

for (const mode of ["early", "wrong-size", "stall-response"] as const) {
  test(`JMAP raw upload ${mode} cannot lead to import`, async () => {
    const context = await setup({ upload: mode, timeout: 200 });
    try {
      const receipt = await context.transport.sendRaw({
        ...raw,
        content: async function* () {
          yield content;
          if (mode === "early") await new Promise(() => {});
        },
      });
      assert.ok(!receipt.successful);
      assert.ok(!context.calls.some((c) => c.name === "Email/import"));
    } finally {
      await context.close();
    }
  });
}

test("JMAP raw null sender uses a default identity without changing the envelope", async () => {
  const context = await setup();
  try {
    assert.ok(
      (await context.transport.sendRaw({
        ...raw,
        envelope: { ...raw.envelope, from: null },
      })).successful,
    );
    const sent = context.calls.find((c) =>
      c.name === "EmailSubmission/set"
    )!.args.create;
    assert.deepEqual(sent, {
      raw: {
        emailId: "email",
        identityId: "first",
        envelope: {
          mailFrom: { email: "" },
          rcptTo: [{ email: "recipient@example.com" }],
        },
      },
    });
  } finally {
    await context.close();
  }
});

test("JMAP raw source failures retain their diagnostic instead of fetch wrapping", async () => {
  const context = await setup();
  try {
    const receipt = await context.transport.sendRaw({
      ...raw,
      content: async function* () {
        yield content;
        throw new TypeError("original source failure");
      },
    });
    assert.ok(!receipt.successful);
    assert.ok(receipt.errorMessages.join().includes("original source failure"));
    assert.ok(!context.calls.some((c) => c.name === "Email/import"));
  } finally {
    await context.close();
  }
});

test("JMAP raw abort stops a large source without buffering or draining it", async () => {
  const context = await setup({ slowUpload: true });
  const controller = new AbortController();
  const reason = new TypeError("stop bounded upload");
  const block = Buffer.from(("x".repeat(998) + "\r\n").repeat(32));
  let produced = 0;
  let closed = 0;
  let started!: () => void;
  const ready = new Promise<void>((resolve) => started = resolve);
  try {
    const pending = context.transport.sendRaw({
      ...raw,
      content: async function* () {
        try {
          yield Buffer.from("X: y\r\n\r\n");
          started();
          for (let i = 0; i < 2048; i++) {
            produced += block.length;
            yield block;
          }
        } finally {
          closed++;
        }
      },
    }, { signal: controller.signal });
    const rejected = assert.rejects(
      pending,
      (error: unknown) => error === reason,
    );
    await ready;
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.ok(produced > 0 && produced < 2048 * block.length, String(produced));
    controller.abort(reason);
    const atAbort = produced;
    await rejected;
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(produced, atAbort);
    assert.equal(closed, 1);
    assert.ok(!context.calls.some((c) => c.name === "Email/import"));
  } finally {
    await context.close();
  }
});

for (const encoding of ["7bit", undefined] as const) {
  test(`JMAP raw ${encoding ? "upload" : "analysis"} progress refreshes inactivity`, async () => {
    const context = await setup({ timeout: 200 });
    try {
      const receipt = await context.transport.sendRaw({
        ...raw,
        encoding,
        content: async function* () {
          for (const line of ["X: y\r\n", "\r\n", "one\r\n", "two\r\n"]) {
            await new Promise((resolve) => setTimeout(resolve, 90));
            yield Buffer.from(line);
          }
        },
      });
      assert.ok(receipt.successful, JSON.stringify(receipt));
    } finally {
      await context.close();
    }
  });
  test(`JMAP raw ${encoding ? "upload" : "analysis"} timeout closes a stalled source`, async () => {
    const context = await setup({ timeout: 100 });
    let closed = 0;
    try {
      const receipt = await context.transport.sendRaw({
        ...raw,
        encoding,
        content: () => ({
          [Symbol.asyncIterator]() {
            return {
              next: () => new Promise<IteratorResult<Uint8Array>>(() => {}),
              return() {
                closed++;
                return Promise.resolve({
                  done: true as const,
                  value: undefined,
                });
              },
            };
          },
        }),
      });
      assert.ok(!receipt.successful);
      assert.ok(receipt.errorMessages.join().includes("timed out"));
      assert.equal(closed, 1);
      assert.ok(!context.calls.some((c) => c.name === "Email/import"));
    } finally {
      await context.close();
    }
  });
}

test("JMAP raw rejects invalid second-pass bytes before import", async () => {
  const context = await setup();
  let opens = 0;
  try {
    const receipt = await context.transport.sendRaw({
      ...raw,
      encoding: undefined,
      content: async function* () {
        yield opens++ === 0 ? content : Buffer.from("X: y\r\n\r\ninvalid\n");
      },
    });
    assert.ok(!receipt.successful);
    assert.equal(receipt.errors?.[0].code, "jmap.raw_message_invalid");
    assert.equal(opens, 2);
    assert.ok(!context.calls.some((c) => c.name === "Email/import"));
  } finally {
    await context.close();
  }
});

for (
  const source of [
    new Blob([content]),
    Promise.resolve(new Uint8Array(content)),
  ]
) {
  test(`JMAP raw accepts ${source instanceof Blob ? "Blob" : "promised bytes"}`, async () => {
    const context = await setup();
    try {
      assert.ok(
        (await context.transport.sendRaw({ ...raw, content: source }))
          .successful,
      );
      assert.deepEqual(context.uploads, [content]);
    } finally {
      await context.close();
    }
  });
}

for (const method of ["Mailbox/get", "Identity/get"] as const) {
  for (const fault of ["account", "call", "duplicate", "identifier"] as const) {
    test(`JMAP raw rejects ${method} discovery with invalid ${fault}`, async () => {
      const context = await setup({ discovery: { method, fault } });
      try {
        const receipt = await context.transport.sendRaw(raw);
        assert.ok(!receipt.successful);
        assert.equal(context.uploads.length, 0);
      } finally {
        await context.close();
      }
    });
  }
}

for (const stage of ["upload", "import", "submission"] as const) {
  for (const status of [401, 403, 429, 502]) {
    for (const body of ["", "plain response"]) {
      test(`JMAP raw ${stage} HTTP ${status} retains ${body ? "text" : "empty"} error metadata`, async () => {
        const context = await setup({ httpError: { stage, status, body } });
        try {
          const receipt = await context.transport.sendRaw(raw);
          assert.ok(!receipt.successful);
          const auth = status === 401 || status === 403;
          const unknown = stage === "submission" && !auth;
          assert.equal(receipt.retryable, stage !== "submission" && !auth);
          assert.equal(receipt.attempts, 1);
          const error = receipt.errors?.[0];
          assert.ok(error);
          assert.equal(
            error.code,
            `jmap.raw_${stage}_${unknown ? "unknown" : "failed"}`,
          );
          assert.equal(error.statusCode, status);
          assert.equal(error.retryAfterMilliseconds, 7000);
          assert.deepEqual(error.providerDetails, {
            responseBody: body,
            jmapErrorType: undefined,
          });
          assert.equal(
            error.category,
            unknown
              ? "unknown"
              : auth
              ? "auth"
              : status === 429
              ? "rate-limit"
              : "server-error",
          );
          assert.equal(context.uploads.length, 1);
          assert.equal(
            context.calls.filter((c) => c.name === "Email/import").length,
            stage === "upload" ? 0 : 1,
          );
          assert.equal(
            context.calls.filter((c) => c.name === "EmailSubmission/set")
              .length,
            stage === "submission" ? 1 : 0,
          );
        } finally {
          await context.close();
        }
      });
    }
  }
}

test("JMAP raw keeps an authentication rejection before upload EOF", async () => {
  const context = await setup({
    upload: "early",
    httpError: { stage: "upload", status: 401, body: "unauthorized" },
  });
  let closed = 0;
  try {
    const receipt = await context.transport.sendRaw({
      ...raw,
      content: () => ({
        [Symbol.asyncIterator]() {
          let first = true;
          return {
            next() {
              if (first) {
                first = false;
                return Promise.resolve({
                  done: false as const,
                  value: content,
                });
              }
              return new Promise<IteratorResult<Uint8Array>>(() => {});
            },
            return() {
              closed++;
              return Promise.resolve({ done: true as const, value: undefined });
            },
          };
        },
      }),
    });
    assert.ok(!receipt.successful);
    assert.ok(!receipt.retryable);
    assert.equal(receipt.errors?.[0].statusCode, 401);
    assert.equal(receipt.errors?.[0].category, "auth");
    assert.equal(closed, 1);
    assert.ok(!context.calls.some((c) => c.name === "Email/import"));
  } finally {
    await context.close();
  }
});

import { composeMessage } from "@upyo/mime";
import { createMessage, readAttachmentContent } from "@upyo/core";

test("JMAP uploads composed MIME unchanged", async () => {
  const context = await setup();
  try {
    const composed = await composeMessage(
      createMessage({
        from: "sender@example.com",
        to: "recipient@example.com",
        bcc: "blind@example.com",
        subject: "Composed",
        content: { text: "First\r\nSecond", html: "<b>Second</b>" },
      }),
    );
    const bytes = await readAttachmentContent(composed.content);
    assert.ok((await context.transport.sendRaw(composed)).successful);
    assert.deepEqual(context.uploads, [Buffer.from(bytes)]);
    const submission = context.calls.find((call) =>
      call.name === "EmailSubmission/set"
    );
    assert.ok(JSON.stringify(submission).includes("blind@example.com"));
    assert.ok(!Buffer.from(bytes).toString().includes("Bcc:"));
  } finally {
    await context.close();
  }
});

import { TEST_DKIM_PRIVATE_KEY } from "../../mime/src/test-utils/dkim-test-keys.ts";

test("JMAP classifies composed replay failures without retrying upload", async () => {
  const context = await setup();
  try {
    let reads = 0;
    const composed = await composeMessage(
      createMessage({
        from: "sender@example.com",
        to: "recipient@example.com",
        subject: "Changed attachment",
        content: { text: "Hello" },
        attachments: {
          filename: "a",
          contentId: "a",
          contentType: "text/plain",
          inline: false,
          content: async function* () {
            yield new Uint8Array([reads++]);
          },
        },
      }),
      {
        dkim: {
          bodyMode: "streaming",
          signatures: [{
            signingDomain: "example.com",
            selector: "test",
            privateKey: TEST_DKIM_PRIVATE_KEY,
          }],
        },
      },
    );
    const receipt = await context.transport.sendRaw(composed);
    assert.ok(!receipt.successful);
    assert.equal(receipt.errors?.[0].code, "jmap.raw_message_invalid");
    assert.ok(!receipt.errors?.[0].retryable);
    assert.equal(reads, 2);
    assert.ok(!context.calls.some((call) => call.name === "Email/import"));
  } finally {
    await context.close();
  }
});

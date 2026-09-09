import assert from "node:assert/strict";
import { test } from "node:test";
import { Buffer } from "node:buffer";
import { createMessage, isRawTransport, type RawMessage } from "@upyo/core";
import { SmtpTransport } from "./smtp-transport.ts";
import { MockSmtpServer } from "./test-utils/mock-smtp-server.ts";

const envelope = {
  from: "sender@example.com",
  to: ["recipient@example.com"],
} as const;
const content = Buffer.from(
  "Date: Tue, 1 Sep 2026 00:00:00 +0000\r\nMessage-ID: <original@example.com>\r\nBcc: hidden@example.com\r\nDKIM-Signature: existing;\r\n folded=value\r\nX-Duplicate: one\r\nX-Duplicate: two\r\nContent-Type: application/pkcs7-mime\r\n\r\n.opaque\r\n.\r\n",
);
const raw: RawMessage = { envelope, content, encoding: "7bit" };
async function setup(
  capabilities: string[] = ["SIZE 100000", "8BITMIME", "SMTPUTF8", "DSN"],
) {
  const server = new MockSmtpServer();
  server.on("error", () => {});
  server.setCapabilities(capabilities);
  const transport = new SmtpTransport({
    host: "localhost",
    port: await server.start(),
    pool: true,
    poolSize: 1,
    socketTimeout: 300,
  });
  return {
    server,
    transport,
    async close() {
      await transport.closeAllConnections();
      await server.stop();
    },
  };
}

for (const encoding of ["7bit", undefined] as const) {
  test(`SMTP raw preserves MIME and reads factory ${encoding ? "once" : "twice"}`, async () => {
    const context = await setup();
    let opens = 0;
    try {
      assert.ok(isRawTransport(context.transport));
      context.transport.config = {
        ...context.transport.config,
        dkim: {
          signatures: [{
            signingDomain: "example.com",
            selector: "x",
            privateKey: "must not be used",
          }],
        },
      };
      const receipt = await context.transport.sendRaw({
        envelope,
        encoding,
        content: async function* () {
          opens++;
          if (encoding || opens === 2) {
            assert.equal(context.server.getReceivedCommands().at(-1), "DATA");
          }
          for (let i = 0; i < content.length; i++) {
            yield content.subarray(i, i + 1);
          }
        },
      });
      assert.ok(receipt.successful, JSON.stringify(receipt));
      assert.equal(opens, encoding ? 1 : 2);
      const received = context.server.getReceivedMessages()[0];
      assert.deepEqual(
        received.rawData,
        Buffer.from(content.toString().replace(/^\./gm, "..")),
      );
      const mail = context.server.getReceivedCommands().find((c) =>
        c.startsWith("MAIL ")
      )!;
      assert.equal(
        mail.includes(`SIZE=${content.length}`),
        encoding === undefined,
      );
    } finally {
      await context.close();
    }
  });
}

test("SMTP raw SIZE counts original bytes without an extra CRLF", async () => {
  const context = await setup([`SIZE ${content.length}`]);
  try {
    const receipt = await context.transport.sendRaw(raw);
    assert.ok(receipt.successful, JSON.stringify(receipt));
    assert.ok(
      context.server.getReceivedCommands().includes(
        `MAIL FROM:<sender@example.com> SIZE=${content.length}`,
      ),
    );
  } finally {
    await context.close();
  }
});

for (const encoding of ["8bit", "utf8"] as const) {
  test(`SMTP raw ${encoding} negotiates capabilities before opening sources`, async () => {
    const context = await setup([]);
    let opens = 0;
    try {
      const receipt = await context.transport.sendRaw({
        ...raw,
        encoding,
        content: async function* () {
          opens++;
          yield content;
        },
      });
      assert.ok(!receipt.successful);
      assert.equal(
        receipt.errors?.[0].code,
        encoding === "8bit"
          ? "smtp.8bitmime-unsupported"
          : "smtp.smtputf8-unsupported",
      );
      assert.equal(opens, 0);
      assert.ok(
        !context.server.getReceivedCommands().some((c) =>
          c.startsWith("MAIL ")
        ),
      );
      assert.ok((await context.transport.sendRaw(raw)).successful);
      assert.equal(context.server.getConnectionCount(), 1);
    } finally {
      await context.close();
    }
  });
}

test("SMTP raw sends 8bit bytes unchanged without requiring SMTPUTF8", async () => {
  const context = await setup(["8BITMIME"]);
  const binary = Buffer.concat([
    Buffer.from("X: y\r\n\r\n"),
    Buffer.from([0xff, 0x80, 13, 10]),
  ]);
  try {
    const receipt = await context.transport.sendRaw({
      ...raw,
      content: binary,
      encoding: "8bit",
    });
    assert.ok(receipt.successful, JSON.stringify(receipt));
    assert.deepEqual(context.server.getReceivedMessages()[0].rawData, binary);
    assert.ok(
      context.server.getReceivedCommands().includes(
        "MAIL FROM:<sender@example.com> BODY=8BITMIME",
      ),
    );
  } finally {
    await context.close();
  }
});

test("SMTP invalid raw DATA poisons its connection without delivering", async () => {
  const context = await setup();
  try {
    const result = await context.transport.sendRaw({
      ...raw,
      content: Buffer.from("X: y\r\n\r\nno final newline"),
    });
    assert.ok(!result.successful);
    assert.equal(result.errors?.[0].code, "smtp.raw-message-invalid");
    assert.equal(context.server.getReceivedMessages().length, 0);
    assert.ok((await context.transport.sendRaw(raw)).successful);
    assert.equal(context.server.getConnectionCount(), 2);
  } finally {
    await context.close();
  }
});

test("SMTP raw envelope supports null sender and rejects option overrides", async () => {
  const context = await setup();
  try {
    const receipt = await context.transport.sendRaw({
      ...raw,
      envelope: { ...envelope, from: null },
    }, { dsn: { return: "headers" } });
    assert.ok(receipt.successful, JSON.stringify(receipt));
    assert.ok(
      context.server.getReceivedCommands().some((c) =>
        c.startsWith("MAIL FROM:<> ") && c.includes("RET=HDRS")
      ),
    );
    // @ts-expect-error Raw envelopes cannot be overridden.
    const failed = await context.transport.sendRaw(raw, { envelope });
    assert.ok(!failed.successful);
    assert.equal(failed.errors?.[0].code, "smtp.envelope-invalid");
    assert.ok(
      (await context.transport.send(
        createMessage({
          from: "a@example.com",
          to: "b@example.com",
          subject: "composed",
          content: { text: "ok" },
        }),
      )).successful,
    );
  } finally {
    await context.close();
  }
});

for (const encoding of ["7bit", undefined] as const) {
  test(`SMTP raw ${encoding ? "DATA" : "analysis"} stalls time out and close the source`, async () => {
    const context = await setup();
    let closed = 0;
    try {
      const receipt = await context.transport.sendRaw({
        envelope,
        encoding,
        content: () => ({
          [Symbol.asyncIterator]() {
            return {
              next: () => new Promise<IteratorResult<Uint8Array>>(() => {}),
              return: () => {
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
      assert.ok(receipt.errorMessages.join().includes("timeout"));
      assert.equal(closed, 1);
      assert.equal(context.server.getReceivedMessages().length, 0);
    } finally {
      await context.close();
    }
  });

  test(`SMTP raw ${encoding ? "DATA" : "analysis"} progress refreshes inactivity`, async () => {
    const context = await setup();
    try {
      const receipt = await context.transport.sendRaw({
        envelope,
        encoding,
        content: async function* () {
          for (const text of ["X: y\r\n", "\r\n", "one\r\n", "two\r\n"]) {
            await new Promise((resolve) => setTimeout(resolve, 120));
            yield Buffer.from(text);
          }
        },
      });
      assert.ok(receipt.successful, JSON.stringify(receipt));
    } finally {
      await context.close();
    }
  });
}

test("SMTP raw cancellation preserves the caller's reason during pending DATA", async () => {
  const context = await setup();
  const controller = new AbortController();
  const reason = new TypeError("cancel raw");
  let closed = 0;
  try {
    const pending = context.transport.sendRaw({
      ...raw,
      content: () => ({
        [Symbol.asyncIterator]() {
          return {
            next() {
              controller.abort(reason);
              return new Promise<IteratorResult<Uint8Array>>(() => {});
            },
            return() {
              closed++;
              return Promise.resolve({ done: true as const, value: undefined });
            },
          };
        },
      }),
    }, { signal: controller.signal });
    await assert.rejects(pending, (error: unknown) => error === reason);
    assert.equal(closed, 1);
    assert.equal(context.server.getReceivedMessages().length, 0);
  } finally {
    await context.close();
  }
});

test("SMTP raw analysis failure keeps a usable preflight connection", async () => {
  const context = await setup();
  try {
    assert.ok(
      !(await context.transport.sendRaw({
        ...raw,
        encoding: undefined,
        content: Buffer.from("bad\n"),
      })).successful,
    );
    assert.ok((await context.transport.sendRaw(raw)).successful);
    assert.equal(context.server.getConnectionCount(), 1);
  } finally {
    await context.close();
  }
});

test("SMTP raw unknown source size is bounded during DATA", async () => {
  const context = await setup(["SIZE 100"]);
  try {
    const receipt = await context.transport.sendRaw({
      ...raw,
      content: async function* () {
        yield content;
      },
    });
    assert.ok(!receipt.successful);
    assert.equal(receipt.errors?.[0].code, "smtp.message-size-exceeded");
    assert.equal(context.server.getReceivedMessages().length, 0);
  } finally {
    await context.close();
  }
});

test("SMTP raw reports partial RCPT rejection", async () => {
  const context = await setup(["PIPELINING"]);
  context.server.setResponses("RCPT", [{ code: 250, message: "Accepted" }, {
    code: 550,
    message: "Rejected",
  }]);
  try {
    const receipt = await context.transport.sendRaw({
      ...raw,
      envelope: { ...envelope, to: ["a@example.com", "b@example.com"] },
    });
    assert.ok(receipt.successful, JSON.stringify(receipt));
    assert.equal(receipt.rejectedRecipients?.[0]?.recipient, "b@example.com");
  } finally {
    await context.close();
  }
});

import { composeMessage } from "@upyo/mime";
import { readAttachmentContent } from "@upyo/core";
import { TEST_DKIM_PRIVATE_KEY } from "./test-utils/dkim-test-keys.ts";

const composedMessage = () =>
  createMessage({
    from: "sender@example.com",
    to: "recipient@example.com",
    bcc: "blind@example.com",
    subject: "Composed",
    content: { text: ".First\r\nSecond" },
  });
const signing = {
  signingDomain: "example.com",
  selector: "test",
  privateKey: TEST_DKIM_PRIVATE_KEY,
};

test("SMTP delivers composed bytes and the Bcc envelope", async () => {
  const context = await setup();
  try {
    const composed = await composeMessage(composedMessage(), {
      dkim: { signatures: [signing] },
    });
    const expected = await readAttachmentContent(composed.content);
    assert.ok((await context.transport.sendRaw(composed)).successful);
    const received = context.server.getReceivedMessages()[0];
    assert.deepEqual(
      Buffer.from(received.rawData.toString().replace(/^\.\./gm, ".")),
      Buffer.from(expected),
    );
    assert.ok(
      context.server.getReceivedCommands().includes(
        "RCPT TO:<blind@example.com>",
      ),
    );
  } finally {
    await context.close();
  }
});

test("SMTP raw maps composed replay errors and discards interrupted DATA connections", async () => {
  const context = await setup();
  try {
    let reads = 0;
    const composed = await composeMessage({
      ...composedMessage(),
      attachments: [{
        filename: "a",
        contentId: "a",
        contentType: "text/plain",
        inline: false,
        content: async function* () {
          yield new Uint8Array([reads++]);
        },
      }],
    }, { dkim: { bodyMode: "streaming", signatures: [signing] } });
    const receipt = await context.transport.sendRaw(composed);
    assert.ok(!receipt.successful);
    assert.equal(receipt.errors?.[0].code, "smtp.raw-message-invalid");
    assert.ok(!receipt.errors?.[0].retryable);
    assert.ok((await context.transport.send(composedMessage())).successful);
    assert.equal(context.server.getConnectionCount(), 2);
  } finally {
    await context.close();
  }
});

for (const source of ["nested", "signed"] as const) {
  test(`SMTP negotiates ${source} Unicode headers before MAIL`, async () => {
    const context = await setup(["8BITMIME"]);
    try {
      if (source === "signed") {
        context.transport.config = {
          ...context.transport.config,
          dkim: { signatures: [{ ...signing, signingDomain: "한글.example" }] },
        };
      }
      const message = source === "nested"
        ? {
          ...composedMessage(),
          attachments: [{
            filename: "a",
            contentId: "한글",
            contentType: "text/plain" as const,
            inline: true,
            content: new Uint8Array(),
          }],
        }
        : composedMessage();
      const receipt = await context.transport.send(message);
      assert.ok(!receipt.successful);
      assert.ok(
        !context.server.getReceivedCommands().some((c) =>
          c.startsWith("MAIL ")
        ),
      );
      context.transport.config = {
        ...context.transport.config,
        dkim: undefined,
      };
      assert.ok((await context.transport.send(composedMessage())).successful);
      assert.equal(context.server.getConnectionCount(), 1);
    } finally {
      await context.close();
    }
    const supported = await setup();
    try {
      if (source === "signed") {
        supported.transport.config = {
          ...supported.transport.config,
          dkim: { signatures: [{ ...signing, signingDomain: "한글.example" }] },
        };
      }
      const message = source === "nested"
        ? {
          ...composedMessage(),
          attachments: [{
            filename: "a",
            contentId: "한글",
            contentType: "text/plain" as const,
            inline: true,
            content: new Uint8Array(),
          }],
        }
        : composedMessage();
      assert.ok((await supported.transport.send(message)).successful);
      assert.ok(
        supported.server.getReceivedCommands().some((c) =>
          c.startsWith("MAIL ") && c.includes("SMTPUTF8")
        ),
      );
    } finally {
      await supported.close();
    }
  });
}

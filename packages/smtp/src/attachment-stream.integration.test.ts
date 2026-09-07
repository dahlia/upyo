import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type AttachmentContent,
  createMessage,
  type Message,
} from "@upyo/core";
import { SmtpTransport } from "./smtp-transport.ts";
import { createSmtpConfig } from "./config.ts";
import { MockSmtpServer } from "./test-utils/mock-smtp-server.ts";
import { TEST_DKIM_PRIVATE_KEY } from "./test-utils/dkim-test-keys.ts";

function message(content: AttachmentContent): Message {
  return createMessage({
    from: "from@example.com",
    to: "to@example.com",
    subject: "Test",
    content: { text: "Test" },
    attachments: {
      filename: "a.bin",
      content,
      contentType: "application/octet-stream",
      contentId: "a",
      inline: false,
    },
  });
}

for (const streaming of [false, true]) {
  test(`nonempty single-byte reads refresh ${streaming ? "preparation" : "DATA"} inactivity`, async () => {
    const server = new MockSmtpServer();
    server.on("error", () => {});
    const transport = new SmtpTransport({
      host: "localhost",
      port: await server.start(),
      pool: false,
      socketTimeout: 180,
      dkim: streaming
        ? {
          bodyMode: "streaming",
          signatures: [{
            signingDomain: "example.com",
            selector: "test",
            privateKey: TEST_DKIM_PRIVATE_KEY,
          }],
        }
        : undefined,
    });
    try {
      const receipt = await transport.send(message(async function* () {
        for (let i = 0; i < 4; i++) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          yield new Uint8Array([i]);
        }
      }));
      assert.ok(receipt.successful, JSON.stringify(receipt));
    } finally {
      await transport.closeAllConnections();
      await server.stop();
    }
  });
}

test("rejects invalid DKIM body modes eagerly", () => {
  const config = {
    host: "localhost",
    dkim: { signatures: [], bodyMode: "invalid" },
  };
  // @ts-expect-error Exercise an invalid JavaScript configuration.
  assert.throws(() => new SmtpTransport(config), TypeError);
  // @ts-expect-error Exercise an invalid JavaScript configuration.
  assert.throws(() => createSmtpConfig(config), TypeError);
});

for (const asynchronous of [false, true]) {
  test(`does not reuse failed DATA in ${asynchronous ? "async" : "sync"} sendMany`, async () => {
    const server = new MockSmtpServer();
    server.on("error", () => {});
    const transport = new SmtpTransport({
      host: "localhost",
      port: await server.start(),
      pool: true,
    });
    let secondReads = 0;
    const messages = [
      message(async function* () {
        yield new Uint8Array([1]);
        throw new TypeError("Read failed.");
      }),
      message(async function* () {
        secondReads++;
        yield new Uint8Array([2]);
      }),
    ];
    try {
      const source = asynchronous
        ? (async function* () {
          yield* messages;
        })()
        : messages;
      const receipts = [];
      for await (const receipt of transport.sendMany(source)) {
        receipts.push(receipt);
      }
      assert.equal(receipts.length, 2);
      assert.ok(receipts.every((receipt) => !receipt.successful));
      assert.equal(secondReads, 0);
      assert.equal(server.getReceivedMessages().length, 0);
    } finally {
      await transport.closeAllConnections();
      await server.stop();
    }
  });
}

test("unsigned sources open after DATA and replay on repeated sends", async () => {
  const server = new MockSmtpServer();
  server.on("error", () => {});
  server.setCapabilities(["SIZE 100000"]);
  const transport = new SmtpTransport({
    host: "localhost",
    port: await server.start(),
    pool: true,
  });
  let reads = 0;
  const mail = message(async function* () {
    assert.equal(server.getReceivedCommands().at(-1), "DATA");
    reads++;
    yield new Uint8Array([1, 2, 3]);
  });
  try {
    assert.ok((await transport.send(mail)).successful);
    assert.ok((await transport.send(mail)).successful);
    assert.equal(reads, 2);
    assert.ok(
      server.getReceivedCommands().filter((c) => c.startsWith("MAIL ")).every((
        c,
      ) => !c.includes("SIZE=")),
    );
    assert.ok(server.getReceivedMessages()[0].data.includes("AQID"));
  } finally {
    await transport.closeAllConnections();
    await server.stop();
  }
});

test("unknown oversized sources poison DATA but not the next pooled send", async () => {
  const server = new MockSmtpServer();
  server.on("error", () => {});
  server.setCapabilities(["SIZE 1000"]);
  const transport = new SmtpTransport({
    host: "localhost",
    port: await server.start(),
    pool: true,
  });
  let closed = false;
  try {
    const result = await transport.send(message(async function* () {
      try {
        while (true) yield new Uint8Array(1024);
      } finally {
        closed = true;
      }
    }));
    assert.ok(!result.successful);
    if (!result.successful) {
      assert.equal(result.errors?.[0].code, "smtp.message-size-exceeded");
    }
    assert.equal(server.getReceivedMessages().length, 0);
    assert.ok(closed);
    assert.ok((await transport.send(message(new Uint8Array([1])))).successful);
  } finally {
    await transport.closeAllConnections();
    await server.stop();
  }
});

test("a changed DKIM replay never sends a DATA terminator", async () => {
  const server = new MockSmtpServer();
  server.on("error", () => {});
  const transport = new SmtpTransport({
    host: "localhost",
    port: await server.start(),
    pool: false,
    dkim: {
      bodyMode: "streaming",
      signatures: [{
        signingDomain: "example.com",
        selector: "test",
        privateKey: TEST_DKIM_PRIVATE_KEY,
      }],
    },
  });
  let reads = 0;
  try {
    const result = await transport.send(message(async function* () {
      yield new Uint8Array([++reads]);
    }));
    assert.ok(!result.successful);
    if (!result.successful) {
      assert.equal(result.errors?.[0].code, "smtp.attachment-replay-mismatch");
    }
    assert.equal(reads, 2);
    assert.equal(server.getReceivedMessages().length, 0);
  } finally {
    await transport.closeAllConnections();
    await server.stop();
  }
});

for (const streaming of [false, true]) {
  test(`times out a stalled source ${streaming ? "before" : "during"} DATA`, async () => {
    const server = new MockSmtpServer();
    server.on("error", () => {});
    const transport = new SmtpTransport({
      host: "localhost",
      port: await server.start(),
      pool: false,
      socketTimeout: 100,
      dkim: streaming
        ? {
          bodyMode: "streaming",
          signatures: [{
            signingDomain: "example.com",
            selector: "test",
            privateKey: TEST_DKIM_PRIVATE_KEY,
          }],
        }
        : undefined,
    });
    let sourceSignal: AbortSignal | undefined;
    try {
      const result = await transport.send(message((signal) => {
        sourceSignal = signal;
        return {
          [Symbol.asyncIterator]() {
            return { next: () => new Promise(() => {}) };
          },
        };
      }));
      assert.ok(!result.successful);
      assert.ok(sourceSignal?.aborted);
      assert.equal(server.getReceivedMessages().length, 0);
    } finally {
      await transport.closeAllConnections();
      await server.stop();
    }
  });
}

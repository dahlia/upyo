import assert from "node:assert/strict";
import { test } from "node:test";
import { Buffer } from "node:buffer";
import { createMessage } from "@upyo/core";
import { prepareMessage } from "./message-converter.ts";
import {
  prepareMessageStream,
  SmtpAttachmentReplayError,
} from "./message-stream.ts";
import { signMessage } from "./dkim/sign.ts";
import {
  TEST_DKIM_ED25519_PRIVATE_KEY,
  TEST_DKIM_PRIVATE_KEY,
} from "./test-utils/dkim-test-keys.ts";
import type { DkimConfig } from "./dkim/types.ts";

async function collect(
  source: AsyncIterable<Uint8Array>,
  signal?: AbortSignal,
): Promise<string> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of source) {
    signal?.throwIfAborted();
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

for (const algorithm of ["rsa-sha256", "ed25519-sha256"] as const) {
  for (
    const canonicalization of [
      "simple/simple",
      "relaxed/simple",
      "simple/relaxed",
      "relaxed/relaxed",
    ] as const
  ) {
    test(`streamed ${algorithm} ${canonicalization} equals the shared buffered signer`, async () => {
      let reads = 0;
      const dkim: DkimConfig = {
        bodyMode: "streaming",
        signatures: [{
          algorithm,
          canonicalization,
          selector: "test",
          signingDomain: "example.com",
          privateKey: algorithm === "rsa-sha256"
            ? TEST_DKIM_PRIVATE_KEY
            : TEST_DKIM_ED25519_PRIVATE_KEY,
        }],
      };
      const plan = prepareMessage(
        createMessage({
          from: "from@example.com",
          to: "to@example.com",
          subject: "Test",
          content: { text: "Test" },
          attachments: {
            filename: "a.bin",
            inline: false,
            contentType: "application/octet-stream",
            contentId: "a",
            content: async function* () {
              reads++;
              yield new Uint8Array([1, 2]);
              yield new Uint8Array([3, 4]);
            },
          },
        }),
        dkim,
      );
      const prepared = await prepareMessageStream(plan, () => {}, () => {});
      assert.equal(reads, 1);
      const raw = await collect(prepared.read());
      assert.equal(reads, 2);
      assert.equal(Buffer.byteLength(raw), prepared.size);
      const unsigned = raw.slice(raw.indexOf("\r\n") + 2);
      const signature = await signMessage(unsigned, dkim.signatures[0]);
      assert.equal(
        raw,
        `${signature.headerName}: ${signature.signature}\r\n${unsigned}`,
      );
      const buffered = await prepareMessageStream(
        { ...plan, dkim: { ...dkim, bodyMode: "buffered" } },
        () => {},
        () => {},
      );
      assert.equal(reads, 3);
      assert.equal(await collect(buffered.read()), raw);
      assert.equal(reads, 3);
    });
  }
}

test("rejects different replay bytes even after unsigned signing fallback", async () => {
  let reads = 0;
  const plan = prepareMessage(
    createMessage({
      from: "from@example.com",
      to: "to@example.com",
      subject: "Test",
      content: { text: "Test" },
      attachments: {
        filename: "a",
        inline: false,
        contentType: "application/octet-stream",
        contentId: "a",
        content: async function* () {
          yield new Uint8Array([++reads]);
        },
      },
    }),
    {
      bodyMode: "streaming",
      onSigningFailure: "send-unsigned",
      signatures: [{
        selector: "test",
        signingDomain: "example.com",
        privateKey: "invalid",
      }],
    },
  );
  const prepared = await prepareMessageStream(plan, () => {}, () => {});
  await assert.rejects(collect(prepared.read()), SmtpAttachmentReplayError);
});

test("multiple signatures share two source reads and preserve prior signatures on failure", async () => {
  let reads = 0;
  const signature = {
    selector: "test",
    signingDomain: "example.com",
    privateKey: TEST_DKIM_PRIVATE_KEY,
  };
  const plan = prepareMessage(
    createMessage({
      from: "from@example.com",
      to: "to@example.com",
      subject: "Test",
      content: { text: "Test" },
      attachments: {
        filename: "a",
        inline: false,
        contentType: "application/octet-stream",
        contentId: "a",
        content: async function* () {
          reads++;
          yield new Uint8Array([1]);
        },
      },
    }),
    {
      bodyMode: "streaming",
      onSigningFailure: "send-unsigned",
      signatures: [signature, {
        ...signature,
        canonicalization: "simple/simple",
        headerFields: ["from", "dkim-signature"],
      }, { ...signature, privateKey: "invalid" }],
    },
  );
  const prepared = await prepareMessageStream(plan, () => {}, () => {});
  const raw = await collect(prepared.read());
  assert.equal(raw.match(/^DKIM-Signature:/gm)?.length, 2);
  assert.equal(reads, 2);
});

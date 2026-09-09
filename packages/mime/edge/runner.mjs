import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { Miniflare } from "miniflare";
import { composeMessage, MimeAttachmentReplayError } from "../dist/index.js";
import * as internal from "../dist/internal.js";
import { verifyDkim } from "../src/test-utils/verify-dkim.ts";
import {
  TEST_DKIM_ED25519_PUBLIC_KEY,
  TEST_DKIM_PUBLIC_KEY,
} from "../src/test-utils/dkim-test-keys.ts";

assert.equal(typeof composeMessage, "function");
assert.equal(MimeAttachmentReplayError, internal.MimeAttachmentReplayError);
const require = createRequire(import.meta.url);
assert.equal(
  require("@upyo/mime").MimeAttachmentReplayError,
  require("@upyo/mime/internal").MimeAttachmentReplayError,
);
assert.equal(typeof require("@upyo/mime").composeMessage, "function");
const bundle = await build({
  entryPoints: [new URL("worker.ts", import.meta.url).pathname],
  bundle: true,
  write: false,
  format: "esm",
  platform: "browser",
  target: "es2022",
  metafile: true,
  plugins: [{
    name: "reject-node",
    setup(builder) {
      builder.onResolve({ filter: /^(node:|buffer$|crypto$)/ }, (args) => {
        throw new TypeError(`Node import in edge bundle: ${args.path}`);
      });
    },
  }],
});
assert.ok(
  !Object.keys(bundle.metafile.inputs).some((path) =>
    /cryptoNode|node-polyfill/.test(path)
  ),
);
const worker = new Miniflare({
  modules: true,
  script: bundle.outputFiles[0].text,
  compatibilityDate: "2026-07-30",
  compatibilityFlags: [],
});
try {
  const response = await worker.dispatchFetch("https://mime.test/");
  assert.equal(response.status, 200, await response.clone().text());
  const result = await response.json();
  assert.ok(result.size > 2 * 1024 * 1024);
  assert.ok(result.maxChunk <= 65536);
  assert.ok(result.cancelled);
  assert.ok(result.unique);
  assert.equal(result.signatures.length, 4);
  for (const signed of result.signatures) {
    verifyDkim(
      signed.wire,
      signed.algorithm === "rsa-sha256"
        ? TEST_DKIM_PUBLIC_KEY
        : TEST_DKIM_ED25519_PUBLIC_KEY,
    );
  }
  console.log(
    "workerd without Node compatibility: composition, streaming, cancellation, RSA and Ed25519 passed.",
  );
} finally {
  await worker.dispose();
}

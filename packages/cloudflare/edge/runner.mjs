import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { Miniflare } from "miniflare";

const bundle = await build({
  tsconfigRaw: {},
  entryPoints: [fileURLToPath(new URL("worker.ts", import.meta.url))],
  bundle: true,
  write: false,
  format: "esm",
  platform: "browser",
  target: "es2022",
  plugins: [
    {
      name: "reject-node",
      setup(builder) {
        builder.onResolve({ filter: /^(node:|buffer$|crypto$)/ }, (args) => {
          throw new TypeError(`Node import in edge bundle: ${args.path}`);
        });
      },
    },
  ],
});
const worker = new Miniflare({
  modules: true,
  script: bundle.outputFiles[0].text,
  compatibilityDate: "2026-07-30",
  compatibilityFlags: [],
  email: { send_email: [{ name: "EMAIL" }] },
});
try {
  const response = await worker.dispatchFetch("https://cloudflare.test/");
  assert.equal(response.status, 200, await response.clone().text());
  const receipt = await response.json();
  assert.ok(receipt.successful, JSON.stringify(receipt));
  assert.ok(receipt.messageId);
  console.log("workerd send_email binding: CloudflareWorkerTransport passed.");
} finally {
  await worker.dispose();
}

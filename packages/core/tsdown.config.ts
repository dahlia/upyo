import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/address.ts",
    "src/attachment.ts",
    "src/message.ts",
    "src/priority.ts",
    "src/receipt.ts",
  ],
  dts: true,
  format: ["esm", "cjs"],
  unbundle: true,
  platform: "neutral",
});

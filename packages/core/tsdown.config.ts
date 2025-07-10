import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/address.ts"],
  dts: true,
  format: ["esm", "cjs"],
  unbundle: true,
  platform: "neutral",
});

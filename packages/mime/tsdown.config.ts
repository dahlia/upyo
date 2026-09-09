import { defineConfig } from "tsdown";
export default defineConfig({
  entry: ["src/index.ts", "src/internal.ts"],
  dts: true,
  format: ["esm", "cjs"],
  unbundle: true,
  platform: "neutral",
});

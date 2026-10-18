import { defineConfig } from "tsdown";

export default defineConfig({
  tsconfig: false,
  entry: ["src/index.ts"],
  dts: true,
  format: ["cjs", "esm"],
  platform: "neutral",
});

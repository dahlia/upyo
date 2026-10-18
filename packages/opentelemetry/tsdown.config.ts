import { defineConfig } from "tsdown";

export default defineConfig({
  tsconfig: false,
  entry: "src/index.ts",
  dts: true,
  format: ["esm", "cjs"],
  platform: "node",
});

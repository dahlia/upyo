import assert from "node:assert/strict";
import { existsSync, globSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = join(import.meta.dirname!, "..");

test("source checking maps every workspace export without built declarations", () => {
  const config: {
    compilerOptions: { paths: Record<string, readonly string[]> };
  } = JSON.parse(readFileSync(join(root, "tsconfig.check.json"), "utf8"));
  const expected: Record<string, readonly string[]> = {};
  for (const manifest of globSync("packages/*/deno.json", { cwd: root })) {
    const metadata: {
      name: string;
      exports: string | Readonly<Record<string, string>>;
    } = JSON.parse(readFileSync(join(root, manifest), "utf8"));
    const exports =
      typeof metadata.exports === "string"
        ? { ".": metadata.exports }
        : metadata.exports;
    const directory = manifest
      .replaceAll("\\", "/")
      .slice(0, -"deno.json".length);
    for (const [subpath, source] of Object.entries(exports)) {
      const specifier =
        metadata.name + (subpath === "." ? "" : subpath.slice(1));
      expected[specifier] = [`./${directory}${source.replace(/^\.\//, "")}`];
      assert.ok(existsSync(join(root, expected[specifier][0])), specifier);
    }
  }
  assert.deepEqual(config.compilerOptions.paths, expected);
});

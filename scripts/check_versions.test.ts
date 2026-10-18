import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = join(import.meta.dirname!, "..");

function fixture() {
  mkdirSync(join(root, "tmp"), { recursive: true });
  const path = mkdtempSync(join(root, "tmp", "check-versions-"));
  mkdirSync(join(path, "scripts"));
  mkdirSync(join(path, "packages", "core"), { recursive: true });
  writeFileSync(join(path, "package.json"), '{"type":"module"}\n');
  writeFileSync(join(path, "deno.json"), '{"workspace":["packages/*"]}\n');
  copyFileSync(
    join(root, "scripts", "check_versions.ts"),
    join(path, "scripts", "check_versions.ts"),
  );
  const metadata = (
    name: string,
    denoVersion?: string,
    npmVersion?: string,
  ) => {
    const dir = join(path, "packages", name);
    mkdirSync(dir, { recursive: true });
    if (denoVersion != null) {
      writeFileSync(
        join(dir, "deno.json"),
        JSON.stringify({ version: denoVersion, exports: "./src/index.ts" }) +
          "\n",
      );
    }
    if (npmVersion != null) {
      writeFileSync(
        join(dir, "package.json"),
        JSON.stringify({
          name: `@upyo/${name}`,
          version: npmVersion,
          private: false,
        }) + "\n",
      );
    }
  };
  metadata("core", "1.2.3", "1.2.3");
  return {
    path,
    metadata,
    run: (...args: string[]) =>
      spawnSync(
        process.execPath,
        [join(path, "scripts", "check_versions.ts"), ...args],
        { cwd: path, encoding: "utf8" },
      ),
    close: () => rmSync(path, { recursive: true, force: true }),
  };
}

test("version checker runs under Node and accepts help aliases", () => {
  const f = fixture();
  try {
    for (const flag of ["--help", "-h"]) {
      const result = f.run(flag);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /Usage: mise run check:versions/);
      assert.match(result.stdout, /--fix/);
    }
  } finally {
    f.close();
  }
});

test("version checker checks both registries and fixes metadata without losing fields", () => {
  const f = fixture();
  try {
    f.metadata("other", "1.0.0", "1.1.0");
    const failed = f.run();
    assert.equal(failed.status, 1);
    assert.match(failed.stderr, /Version mismatch/);
    assert.match(failed.stderr, /deno.json/);
    assert.match(failed.stderr, /package.json/);
    const fixed = f.run("--fix");
    assert.equal(fixed.status, 0, fixed.stderr);
    assert.match(fixed.stderr, /Fixed 2 version mismatches/);
    for (const file of ["deno.json", "package.json"]) {
      const contents = readFileSync(
        join(f.path, "packages", "other", file),
        "utf8",
      );
      assert.equal(JSON.parse(contents).version, "1.2.3");
      assert.ok(contents.endsWith("\n"));
    }
    assert.equal(
      JSON.parse(
        readFileSync(join(f.path, "packages", "other", "deno.json"), "utf8"),
      ).exports,
      "./src/index.ts",
    );
    assert.ok(
      !JSON.parse(
        readFileSync(join(f.path, "packages", "other", "package.json"), "utf8"),
      ).private,
    );
    assert.equal(f.run().status, 0);
  } finally {
    f.close();
  }
});

test("version checker preserves missing-manifest handling and the short fix flag", () => {
  const f = fixture();
  try {
    f.metadata("npm-only", undefined, "9.0.0");
    f.metadata("deno-only", "0.0.0");
    const fixed = f.run("-f");
    assert.equal(fixed.status, 0, fixed.stderr);
    assert.match(fixed.stderr, /Fixed 1 version mismatch\./);
    assert.equal(
      JSON.parse(
        readFileSync(
          join(f.path, "packages", "npm-only", "package.json"),
          "utf8",
        ),
      ).version,
      "9.0.0",
    );
    assert.equal(f.run().status, 0);
  } finally {
    f.close();
  }
});

test("version checker resolves workspace globs relative to its repository", () => {
  const f = fixture();
  try {
    f.metadata("outside-pattern", "9.0.0", "9.0.0");
    writeFileSync(join(f.path, "deno.json"), '{"workspace":["packages/c*"]}\n');
    const result = spawnSync(
      process.execPath,
      [join(f.path, "scripts", "check_versions.ts")],
      { cwd: root, encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
  } finally {
    f.close();
  }
});

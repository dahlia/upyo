import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { setTimeout } from "node:timers/promises";
import { join } from "node:path";
import { test } from "node:test";
import { liveCommands, runLiveTests } from "./test_live.ts";

const root = join(import.meta.dirname!, "..");
const providers = [
  "mailgun",
  "resend",
  "sendgrid",
  "lettermint",
  "maileroo",
  "mailtrap",
];

test("live selection runs only the six CI provider suites in runtime order", () => {
  const commands = liveCommands("all", root);
  assert.equal(commands.length, 18);
  assert.deepEqual(
    commands.map((c) => c.runtime),
    [
      ...Array<string>(6).fill("node"),
      ...Array<string>(6).fill("deno"),
      ...Array<string>(6).fill("bun"),
    ],
  );
  for (let index = 0; index < commands.length; index++) {
    const command = commands[index];
    const provider = providers[index % 6];
    assert.equal(command.cwd, join(root, "packages", provider));
    assert.equal(
      command.args.at(-1),
      `./src/${provider}-transport.e2e.test.ts`,
    );
    assert.ok(existsSync(join(command.cwd, command.args.at(-1)!)));
  }
});

test("live commands preserve runtime requirements", () => {
  assert.deepEqual(liveCommands("node", root)[0].args.slice(0, -1), [
    "--network-family-autoselection-attempt-timeout=5000",
    "--experimental-transform-types",
    "--test-isolation=none",
    "--test",
  ]);
  assert.deepEqual(liveCommands("deno", root)[0].args.slice(0, -1), [
    "test",
    "--allow-env",
    "--allow-net",
  ]);
  assert.deepEqual(liveCommands("bun", root)[0].args.slice(0, -1), [
    "test",
    "--timeout=90000",
  ]);
  assert.throws(() => liveCommands("sh", root), TypeError);
});

test("live runner aggregates failures and waits for every selected suite", () => {
  let count = 0;
  const messages: string[] = [];
  const result = runLiveTests(
    "node",
    root,
    (_command, _args, options) => {
      assert.equal(options.timeout, 600000);
      assert.equal(options.killSignal, "SIGKILL");
      count++;
      if (count === 1) return { status: 2, signal: null };
      if (count === 2) return { status: null, signal: "SIGKILL" };
      if (count === 3)
        return { status: null, signal: null, error: new Error("spawn failed") };
      return { status: 0, signal: null };
    },
    (message) => messages.push(message),
  );
  assert.equal(result, 1);
  assert.equal(count, 6);
  assert.equal(messages.filter((m) => m.includes("failed")).length, 3);
});

test("live runner succeeds only when every selected suite succeeds", () => {
  let count = 0;
  assert.equal(
    runLiveTests(
      "all",
      root,
      () => {
        count++;
        return { status: 0, signal: null };
      },
      () => {},
    ),
    0,
  );
  assert.equal(count, 18);
  assert.throws(
    () =>
      runLiveTests("invalid", root, () => {
        assert.fail("Invalid runtimes must not execute a command.");
      }),
    TypeError,
  );
});

test("a timed-out Node suite cannot keep running after the next suite starts", async (context) => {
  mkdirSync(join(root, "tmp"), { recursive: true });
  const directory = mkdtempSync(join(root, "tmp", "live-timeout-"));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const fixture = join(directory, "timeout.test.mjs");
  const ready = join(directory, "ready");
  const sent = join(directory, "sent");
  writeFileSync(
    fixture,
    `
    import { test } from "node:test";
    import { writeFileSync } from "node:fs";
    test("delayed send stand-in", async () => {
      writeFileSync(${JSON.stringify(ready)}, "ready");
      await new Promise(resolve => globalThis.setTimeout(resolve, 1500));
      writeFileSync(${JSON.stringify(sent)}, "sent");
    });
  `,
  );
  const args = [...liveCommands("node", root)[0].args.slice(0, -1), fixture];
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    env: { ...process.env, NODE_TEST_CONTEXT: undefined },
    timeout: 1000,
    killSignal: "SIGKILL",
    stdio: "ignore",
  });
  assert.ok(existsSync(ready), "The fixture must start before the timeout.");
  assert.equal(result.signal, "SIGKILL");
  await setTimeout(1000, undefined, { signal: context.signal });
  assert.ok(
    !existsSync(sent),
    "The timed-out suite must stop before the next send.",
  );
});

import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const providers = [
  "mailgun",
  "resend",
  "sendgrid",
  "lettermint",
  "maileroo",
  "mailtrap",
] as const;
const runtimes = ["node", "deno", "bun"] as const;
type Runtime = (typeof runtimes)[number];

/** One provider suite invocation, run from its package directory. */
export interface LiveCommand {
  readonly runtime: Runtime;
  readonly cwd: string;
  readonly args: readonly string[];
}

/**
 * Selects only the external provider suites whose credentials CI supplies.
 * @param runtime A runtime name, or `all` for Node.js, Deno, then Bun.
 * @param root Repository root.
 * @returns Commands in serial execution order.
 * @throws {TypeError} If the runtime is unsupported.
 */
export function liveCommands(
  runtime: string,
  root: string,
): readonly LiveCommand[] {
  const selected =
    runtime === "all"
      ? runtimes
      : runtimes.filter((candidate) => candidate === runtime);
  if (selected.length === 0) {
    throw new TypeError(`Unsupported live test runtime: ${runtime}`);
  }
  return selected.flatMap((runtime) =>
    providers.map((provider) => ({
      runtime,
      cwd: join(root, "packages", provider),
      args: [
        ...(runtime === "node"
          ? [
              "--network-family-autoselection-attempt-timeout=5000",
              "--experimental-transform-types",
              "--test-isolation=none",
              "--test",
            ]
          : runtime === "deno"
            ? ["test", "--allow-env", "--allow-net"]
            : ["test", "--timeout=90000"]),
        `./src/${provider}-transport.e2e.test.ts`,
      ],
    })),
  );
}

type Execute = (
  command: string,
  args: readonly string[],
  options: {
    readonly cwd: string;
    readonly stdio: "inherit";
    readonly timeout: number;
    readonly killSignal: "SIGKILL";
  },
) => {
  readonly status: number | null;
  readonly signal: string | null;
  readonly error?: Error;
};

/**
 * Runs live suites serially and reports failure after all selected suites finish.
 * @param runtime A runtime name, or `all`.
 * @param root Repository root.
 * @param execute Synchronous child runner; waits for exit even on timeout.
 * @param log Progress and failure reporter.
 * @returns Zero on success, one if any suite failed or could not run.
 * @throws {TypeError} If the runtime is unsupported.
 */
export function runLiveTests(
  runtime: string,
  root: string,
  execute: Execute = spawnSync,
  log: (message: string) => void = console.log,
): number {
  let failed = false;
  for (const command of liveCommands(runtime, root)) {
    log(`Live tests: ${command.runtime} ${command.cwd}`);
    const result = execute(command.runtime, command.args, {
      cwd: command.cwd,
      stdio: "inherit",
      timeout: 600000,
      // A timed-out child must exit before another live suite starts.
      killSignal: "SIGKILL",
    });
    if (result.status !== 0 || result.signal != null || result.error != null) {
      failed = true;
      log(
        `Live tests failed: ${command.runtime} ${command.cwd} (${result.error?.message ?? result.signal ?? result.status}).`,
      );
    }
  }
  return failed ? 1 : 0;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = runLiveTests(
    process.argv[2] ?? "all",
    resolve(fileURLToPath(new URL("..", import.meta.url))),
  );
}

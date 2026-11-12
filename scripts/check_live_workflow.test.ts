import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { test } from "node:test";

interface Job {
  readonly if?: string;
  readonly needs?: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
  readonly concurrency?: {
    readonly group: string;
    readonly "cancel-in-progress": boolean;
  };
  readonly steps: readonly {
    readonly run?: string;
    readonly uses?: string;
    readonly with?: Readonly<Record<string, unknown>>;
  }[];
  readonly "timeout-minutes"?: number;
  readonly permissions?: Readonly<Record<string, string>>;
}
const root = join(import.meta.dirname!, "..");
const workflow: {
  readonly on: Readonly<Record<string, unknown>> & {
    readonly schedule: readonly { readonly cron: string }[];
  };
  readonly jobs: Readonly<Record<string, Job>>;
  readonly concurrency: { readonly "cancel-in-progress": boolean };
} = JSON.parse(
  execFileSync("nu", ["-c", "open .github/workflows/main.yaml | to json"], {
    cwd: root,
    encoding: "utf8",
  }),
);

const credentials = [
  "MAILGUN_KEY",
  "RESEND_API_KEY",
  "SENDGRID_API_KEY",
  "LETTERMINT_API_TOKEN",
  "MAILEROO_API_KEY",
  "MAILTRAP_API_TOKEN",
];

test("weekly and manual runs preserve push/PR and never publish", () => {
  assert.deepEqual(Object.keys(workflow.on).sort(), [
    "pull_request",
    "push",
    "schedule",
    "workflow_dispatch",
  ]);
  assert.deepEqual(workflow.on.schedule, [{ cron: "17 0 * * 1" }]);
  for (const name of ["publish", "public-docs"]) {
    assert.equal(workflow.jobs[name].if, "github.event_name == 'push'");
  }
  assert.ok(workflow.jobs.publish.needs?.includes("test-live"));
  assert.ok(workflow.concurrency["cancel-in-progress"]);
});

test("only the serialized non-PR live job receives provider credentials", () => {
  const live = workflow.jobs["test-live"];
  assert.equal(live.if, "github.event_name != 'pull_request'");
  assert.deepEqual(live.concurrency, {
    group: "upyo-live-providers",
    "cancel-in-progress": false,
  });
  assert.equal(live["timeout-minutes"], 60);
  assert.deepEqual(live.permissions, { contents: "read" });
  assert.ok(live.steps.some((step) => step.run === "mise run test:live"));
  assert.ok(
    live.steps.some(
      (step) =>
        step.uses?.startsWith("actions/checkout@") &&
        step.with?.["persist-credentials"] === false,
    ),
  );
  for (const credential of credentials) {
    assert.equal(
      live.env?.[credential],
      `\${{ github.event_name != 'pull_request' && secrets.${credential} || '' }}`,
    );
    for (const [name, job] of Object.entries(workflow.jobs)) {
      if (name !== "test-live")
        assert.ok(!JSON.stringify(job).includes(`secrets.${credential}`), name);
    }
  }
  for (const runtime of ["node", "deno", "bun"]) {
    assert.ok(!workflow.jobs[`test-${runtime}`].concurrency);
    assert.ok(
      workflow.jobs[`test-${runtime}`].steps.some((step) =>
        step.run?.startsWith(`mise run test:${runtime}`),
      ),
    );
  }
});

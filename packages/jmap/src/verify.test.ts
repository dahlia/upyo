import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { JmapTransport } from "./jmap-transport.ts";
import { JmapApiError } from "./errors.ts";
import { createMessage } from "@upyo/core";

const core = "urn:ietf:params:jmap:core";
const mail = "urn:ietf:params:jmap:mail";
const submission = "urn:ietf:params:jmap:submission";

async function setup() {
  const calls: string[] = [];
  const authorizations: (string | undefined)[] = [];
  let base = "";
  const state = {
    status: 200,
    stall: "",
    identity: "identity",
    drafts: true,
    methodError: false,
    duplicate: false,
    wrongAccount: false,
    contradiction: false,
    session: {} as Record<string, unknown>,
  };
  let resolveStalled!: () => void;
  const stalledPromise = new Promise<void>((resolve) => {
    resolveStalled = resolve;
  });
  const stalled = { promise: stalledPromise, resolve: resolveStalled };
  const server = createServer(async (req, res) => {
    req.on("error", () => {});
    authorizations.push(req.headers.authorization);
    const reply = (data: unknown) => {
      res.writeHead(state.status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };
    if (req.url === "/session") {
      calls.push("session");
      if (state.stall === "session") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.flushHeaders();
        res.write("{");
        stalled.resolve();
        return;
      }
      reply(state.session);
      return;
    }
    const chunks: Uint8Array[] = [];
    try {
      for await (const chunk of req) chunks.push(chunk);
    } catch {
      return;
    }
    const request = JSON.parse(Buffer.concat(chunks).toString());
    const [name, args, id] = request.methodCalls[0];
    calls.push(name);
    if (name === "Email/set") {
      calls.push("EmailSubmission/set");
      reply({
        methodResponses: [[
          "Email/set",
          { created: { draft: { id: "email" } } },
          "c0",
        ], [
          "EmailSubmission/set",
          { created: { submission: { id: "sent" } } },
          "c1",
        ]],
      });
      return;
    }
    if (state.stall === name) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.flushHeaders();
      res.write("{");
      stalled.resolve();
      return;
    }
    const list = name === "Mailbox/get"
      ? state.drafts ? [{ id: "drafts", role: "drafts" }] : []
      : [{ id: state.identity, email: "*@example.com" }];
    const response = state.methodError
      ? ["error", { type: "forbidden", description: "Not allowed." }, id]
      : [name, {
        accountId: state.wrongAccount ? "other" : args.accountId,
        list,
        notFound: state.contradiction ? [state.identity] : [],
      }, id];
    reply({
      methodResponses: state.duplicate ? [response, response] : [response],
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  base = `http://127.0.0.1:${address.port}`;
  state.session = {
    capabilities: { [core]: {}, [mail]: {}, [submission]: {} },
    accounts: {
      a: {
        isReadOnly: false,
        accountCapabilities: { [mail]: {}, [submission]: {} },
      },
    },
    apiUrl: base + "/api",
  };
  return {
    state,
    calls,
    authorizations,
    stalled,
    base,
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

test("JMAP verification always performs fresh read-only discovery", async () => {
  const fixture = await setup();
  try {
    const transport = new JmapTransport({
      sessionUrl: fixture.base + "/session",
      bearerToken: "token",
      identityId: "identity",
      baseUrl: fixture.base,
      retries: 0,
    });
    assert.equal(await transport.verify(), undefined);
    await transport.verify();
    assert.deepEqual(fixture.calls, [
      "session",
      "Mailbox/get",
      "Identity/get",
      "session",
      "Mailbox/get",
      "Identity/get",
    ]);
    assert.ok(
      fixture.authorizations.every((value) => value === "Bearer token"),
    );
    fixture.state.status = 401;
    await assert.rejects(
      transport.verify(),
      (e) => e instanceof JmapApiError && e.statusCode === 401,
    );
  } finally {
    await fixture.close();
  }
});

for (
  const failure of [
    "capabilities",
    "accounts",
    "apiUrl",
    "readonly",
    "mailOnly",
    "unknownAccount",
    "identity",
    "drafts",
    "methodError",
    "duplicate",
    "wrongAccount",
    "contradiction",
  ] as const
) {
  test(`JMAP verification rejects ${failure}`, async () => {
    const f = await setup();
    try {
      if (
        failure === "capabilities" || failure === "accounts" ||
        failure === "apiUrl"
      ) f.state.session[failure] = null;
      else if (failure === "readonly") {
        f.state.session.accounts = {
          a: {
            isReadOnly: true,
            accountCapabilities: { [mail]: {}, [submission]: {} },
          },
        };
      } else if (failure === "mailOnly") {
        f.state.session.accounts = {
          a: { isReadOnly: false, accountCapabilities: { [mail]: {} } },
        };
      } else if (failure === "identity") f.state.identity = "wrong";
      else if (failure === "drafts") f.state.drafts = false;
      else if (failure !== "unknownAccount") f.state[failure] = true;
      const transport = new JmapTransport({
        sessionUrl: f.base + "/session",
        basicAuth: { username: "u", password: "p" },
        accountId: failure === "unknownAccount" ? "missing" : undefined,
        identityId: "identity",
        retries: 0,
      });
      await assert.rejects(
        transport.verify(),
        (e) =>
          e instanceof JmapApiError &&
          (failure !== "methodError" || e.jmapErrorType === "forbidden"),
      );
      assert.ok(
        f.calls.every((name) =>
          ["session", "Mailbox/get", "Identity/get"].includes(name)
        ),
      );
    } finally {
      await f.close();
    }
  });
}

for (const stage of ["session", "Mailbox/get", "Identity/get"]) {
  for (const cancel of [false, true]) {
    test(`JMAP ${stage} body ${cancel ? "cancellation" : "timeout"} settles`, async () => {
      const f = await setup();
      f.state.stall = stage;
      const controller = new AbortController();
      const reason = new TypeError("Stopped.");
      try {
        const transport = new JmapTransport({
          sessionUrl: f.base + "/session",
          bearerToken: "token",
          timeout: cancel ? 5000 : 100,
          retries: 0,
        });
        const pending = transport.verify({ signal: controller.signal });
        const checked = assert.rejects(
          pending,
          (e) => cancel ? e === reason : e instanceof JmapApiError,
        );
        await f.stalled.promise;
        if (cancel) controller.abort(reason);
        await checked;
      } finally {
        controller.abort(reason);
        await f.close();
      }
    });
  }
}

test("JMAP pre-abort preserves arbitrary reasons without I/O", async () => {
  const f = await setup();
  try {
    const transport = new JmapTransport({
      sessionUrl: f.base + "/session",
      bearerToken: "token",
    });
    const controller = new AbortController();
    controller.abort(null);
    await assert.rejects(
      transport.verify({ signal: controller.signal }),
      (e) => e === null,
    );
    assert.deepEqual(f.calls, []);
  } finally {
    await f.close();
  }
});

for (const accountId of [undefined, "a"]) {
  test(`all Session accounts are validated, configured=${accountId != null}`, async () => {
    const f = await setup();
    try {
      f.state.session.accounts = {
        broken: null,
        ...Object(f.state.session.accounts),
      };
      const transport = new JmapTransport({
        sessionUrl: f.base + "/session",
        bearerToken: "token",
        accountId,
      });
      await assert.rejects(
        transport.verify(),
        (e) => e instanceof JmapApiError && e.message.includes("broken"),
      );
      assert.deepEqual(f.calls, ["session"]);
    } finally {
      await f.close();
    }
  });
}

test("verification bypasses and preserves a populated delivery Session cache", async () => {
  const f = await setup();
  try {
    const transport = new JmapTransport({
      sessionUrl: f.base + "/session",
      bearerToken: "token",
      identityId: "identity",
      retries: 0,
    });
    const message = createMessage({
      from: "a@example.com",
      to: "b@example.com",
      subject: "Test",
      content: { text: "Test" },
    });
    assert.ok((await transport.send(message)).successful);
    assert.equal(f.calls.filter((c) => c === "session").length, 1);
    f.state.status = 401;
    await assert.rejects(transport.verify(), JmapApiError);
    assert.equal(f.calls.filter((c) => c === "session").length, 2);
    f.state.status = 200;
    await transport.verify();
    assert.equal(f.calls.filter((c) => c === "session").length, 3);
    assert.ok((await transport.send(message)).successful);
    assert.equal(f.calls.filter((c) => c === "session").length, 3);
  } finally {
    await f.close();
  }
});

test("verification follows the structured-send account and honors explicit account selection", async () => {
  const f = await setup();
  try {
    f.state.session.accounts = {
      first: { isReadOnly: false, accountCapabilities: { [mail]: {} } },
      second: {
        isReadOnly: false,
        accountCapabilities: { [mail]: {}, [submission]: {} },
      },
    };
    const config = {
      sessionUrl: f.base + "/session",
      bearerToken: "token",
      retries: 0,
    };
    await assert.rejects(
      new JmapTransport(config).verify(),
      (e) => e instanceof JmapApiError && e.message.includes("first"),
    );
    await new JmapTransport({ ...config, accountId: "second" }).verify();
  } finally {
    await f.close();
  }
});

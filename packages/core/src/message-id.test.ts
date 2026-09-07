import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMessage } from "./message.ts";
import {
  formatMessageId,
  generateMessageId,
  parseMessageId,
  resolveThreadingHeaders,
} from "./message-id.ts";

describe("parseMessageId()", () => {
  const accepted: readonly (readonly [string, string])[] = [
    ["<a@b>", "a@b"],
    ["a@b", "a@b"],
    ["ab@cd", "ab@cd"],
    ["a.b+tag@example.com", "a.b+tag@example.com"],
    ["!#$%&'*+-/=?^_`{|}~@example.com", "!#$%&'*+-/=?^_`{|}~@example.com"],
    ["a@[x@y]", "a@[x@y]"],
    ["<a@[IPv6:::1]>", "a@[IPv6:::1]"],
    ["a@[192.0.2.1]", "a@[192.0.2.1]"],
    ["a@b\u{1F600}", "a@b\u{1F600}"],
    ["안녕@한국.한국", "안녕@한국.한국"],
  ];

  for (const [input, expected] of accepted) {
    it(`accepts ${JSON.stringify(input)}`, () => {
      assert.equal(parseMessageId(input), expected);
    });
  }

  const rejected: readonly string[] = [
    "",
    "<>",
    "a@b c@d",
    "a@b@c",
    "a..b@c",
    ".a@b",
    "a.@b",
    "a@",
    "@b",
    "a@b.",
    "a@.b",
    "a@[]",
    "a@[x\\y]",
    "a@[x[y]",
    "<<a@b>>",
    "a@b>",
    "<a@b",
    "a@b<",
    '"q"@b',
    "a(comment)@b",
    "a@b\uD800",
    " a@b ",
    "a@b\r\nX: y",
    "a\t@b",
  ];

  for (const input of rejected) {
    it(`rejects ${JSON.stringify(input)}`, () => {
      assert.equal(parseMessageId(input), undefined);
    });
  }

  it("obeys the round-trip law", () => {
    for (const [input] of accepted) {
      const parsed = parseMessageId(input);
      assert.ok(parsed != null);
      assert.equal(parseMessageId(formatMessageId(parsed)), parsed);
    }
  });
});

describe("formatMessageId()", () => {
  it("wraps a bare identifier in angle brackets", () => {
    assert.equal(formatMessageId("a@b"), "<a@b>");
    assert.equal(formatMessageId("a@[x@y]"), "<a@[x@y]>");
  });

  it("rejects an already bracketed identifier", () => {
    assert.throws(() => formatMessageId("<a@b>"), {
      name: "TypeError",
      message: /Invalid message ID/,
    });
  });

  it("rejects an invalid identifier", () => {
    for (const invalid of ["", "a", "a@", "@b", "a@b c@d"]) {
      assert.throws(() => formatMessageId(invalid), { name: "TypeError" });
    }
  });
});

describe("generateMessageId()", () => {
  it("roots the identifier in the given domain", () => {
    const id = generateMessageId("example.com");
    assert.ok(id.endsWith("@example.com"));
    assert.equal(parseMessageId(id), id);
  });

  it("generates a distinct identifier every time", () => {
    const ids = new Set<string>();
    for (let index = 0; index < 100; index++) {
      ids.add(generateMessageId("example.com"));
    }
    assert.equal(ids.size, 100);
  });

  it("passes an ASCII domain through unchanged", () => {
    for (const domain of ["example.com", "[192.0.2.1]", "foo/bar", "a!b"]) {
      assert.ok(generateMessageId(domain).endsWith(`@${domain}`));
    }
  });

  it("converts a Unicode DNS name to its ASCII form", () => {
    const id = generateMessageId("exämple.com");
    assert.ok(
      id.endsWith("@xn--exmple-cua.com"),
      `expected a punycode domain, got ${JSON.stringify(id)}`,
    );
  });

  it("converts a decomposed DNS name the same as a precomposed one", () => {
    // "éxample.com" spelled with a combining acute accent.
    const decomposed = generateMessageId("e\u0301xample.com");
    const precomposed = generateMessageId("\u00e9xample.com");

    assert.ok(
      decomposed.endsWith("@xn--xample-9ua.com"),
      `expected a punycode domain, got ${JSON.stringify(decomposed)}`,
    );
    assert.equal(
      decomposed.slice(decomposed.indexOf("@")),
      precomposed.slice(precomposed.indexOf("@")),
    );
  });

  it("keeps a Unicode domain that is not a DNS name verbatim", () => {
    const id = generateMessageId("föö/bar");
    assert.ok(id.endsWith("@föö/bar"));
  });

  it("rejects a domain that is not a valid identifier right-hand side", () => {
    for (
      const domain of [
        "",
        " ",
        "example.com:80",
        "http://example.com",
        "example com",
        "exa\r\nmple.com",
        ".example.com",
        "example..com",
        "[]",
      ]
    ) {
      assert.throws(
        () => generateMessageId(domain),
        { name: "TypeError" },
        `expected ${JSON.stringify(domain)} to be rejected`,
      );
    }
  });
});

describe("resolveThreadingHeaders()", () => {
  const base = {
    from: "sender@example.com",
    to: "recipient@example.com",
    subject: "Test",
    content: { text: "Test" },
  } as const;

  it("omits a field the message leaves unset", () => {
    const resolved = resolveThreadingHeaders(createMessage(base));

    assert.equal(resolved.size, 0);
    assert.ok(!resolved.has("In-Reply-To"));
  });

  it("maps an empty list to null", () => {
    const resolved = resolveThreadingHeaders(
      createMessage({ ...base, inReplyTo: [] }),
    );

    assert.ok(resolved.has("In-Reply-To"));
    assert.equal(resolved.get("In-Reply-To"), null);
    assert.ok(!resolved.has("References"));
  });

  it("formats the identifiers of a populated list", () => {
    const resolved = resolveThreadingHeaders(createMessage({
      ...base,
      inReplyTo: "122@example.com",
      references: ["120@example.com", "121@example.com"],
    }));

    assert.equal(resolved.get("In-Reply-To"), "<122@example.com>");
    assert.equal(
      resolved.get("References"),
      "<120@example.com> <121@example.com>",
    );
  });

  it("rejects an invalid identifier a hand-built message carries", () => {
    assert.throws(
      () =>
        resolveThreadingHeaders({
          ...createMessage(base),
          references: ["not an identifier"],
        }),
      { name: "TypeError", message: /Invalid message ID/ },
    );
  });
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { BodyHasher } from "./body-hash.ts";
import {
  canonicalizeBodyRelaxed,
  canonicalizeBodySimple,
} from "./canonicalize.ts";

test("incremental body hashes match canonicalization at every split", () => {
  const bodies = [
    "",
    "\r\n",
    "\r\n\r\n",
    " a \t b\t \r\n\r\n",
    "a\r\nb",
    "\r\na\r\n \t\r\n",
    "a\rb\nc\r",
    "a\r\r\nb\t\rc\n d\r\n\r\n",
    " \t",
    "a" + " ".repeat(100000) + "\r\n",
    "\r\n \t" + "a".repeat(131073) + "\t\r\nb\r\n\r\n",
    ("A".repeat(76) + "\r\n").repeat(2000),
  ];
  for (const mode of ["simple", "relaxed"] as const) {
    for (const body of bodies) {
      const bytes = new TextEncoder().encode(body);
      const canonical = mode === "simple"
        ? canonicalizeBodySimple(body)
        : canonicalizeBodyRelaxed(body);
      const expected = createHash("sha256").update(canonical).digest("base64");
      for (const width of [1, 2, 3, 57, 65536, 200000]) {
        const hash = new BodyHasher(mode);
        for (let offset = 0; offset < bytes.length; offset += width) {
          hash.update(bytes.subarray(offset, offset + width));
        }
        assert.equal(hash.digest(), expected, `${mode}, width ${width}`);
      }
    }
  }
});

test("body hash span boundaries preserve pending CR and whitespace", () => {
  const bodies = [
    "\r\n\r\nabc \tdef\t \r\n\r\n",
    " \tabc\r\r\ndef\n\tghi\r",
    "abc\r\n \t\r\n\r\n",
  ];
  for (const mode of ["simple", "relaxed"] as const) {
    for (const body of bodies) {
      const bytes = new TextEncoder().encode(body);
      const canonical = mode === "simple"
        ? canonicalizeBodySimple(body)
        : canonicalizeBodyRelaxed(body);
      const expected = createHash("sha256").update(canonical).digest("base64");
      for (let first = 0; first <= bytes.length; first++) {
        for (let second = first; second <= bytes.length; second++) {
          const hash = new BodyHasher(mode);
          hash.update(bytes.subarray(0, first));
          hash.update(bytes.subarray(first, second));
          hash.update(bytes.subarray(second));
          assert.equal(hash.digest(), expected, `${mode}: ${first}, ${second}`);
        }
      }
    }
  }
});

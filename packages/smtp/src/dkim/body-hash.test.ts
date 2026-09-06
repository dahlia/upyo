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
    " \t",
    "a" + " ".repeat(100000) + "\r\n",
  ];
  for (const mode of ["simple", "relaxed"] as const) {
    for (const body of bodies) {
      const bytes = new TextEncoder().encode(body);
      const canonical = mode === "simple"
        ? canonicalizeBodySimple(body)
        : canonicalizeBodyRelaxed(body);
      const expected = createHash("sha256").update(canonical).digest("base64");
      for (const width of [1, 2, 3, 57, 65536]) {
        const hash = new BodyHasher(mode);
        for (let offset = 0; offset < bytes.length; offset += width) {
          hash.update(bytes.subarray(offset, offset + width));
        }
        assert.equal(hash.digest(), expected, `${mode}, width ${width}`);
      }
    }
  }
});

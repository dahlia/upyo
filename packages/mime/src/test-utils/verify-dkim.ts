import assert from "node:assert/strict";
import { createHash, verify } from "node:crypto";

/** Independent wire-level oracle; does not import production canonicalizers. */
export function verifyDkim(raw: string, publicKey: string): void {
  const split = raw.indexOf("\r\n\r\n");
  const fields = raw.slice(0, split).split(/\r\n(?![ \t])/);
  const dkim = fields.find((field) => field.startsWith("DKIM-Signature:"));
  assert.ok(dkim);
  const tags = Object.fromEntries(
    dkim.slice(15).replace(/\r\n/g, "").split(";").map((tag) => {
      const equal = tag.indexOf("=");
      return [tag.slice(0, equal).trim(), tag.slice(equal + 1).trim()];
    }),
  );
  const [headerMode, bodyMode] = tags.c.split("/");
  let body = raw.slice(split + 4);
  if (bodyMode === "relaxed") {
    body = body.split("\r\n").map((line) =>
      line.replace(/[ \t]+/g, " ").replace(/ +$/, "")
    ).join("\r\n");
  }
  body = body.replace(/(?:\r\n)*$/, "");
  if (body.length > 0 || bodyMode === "simple") body += "\r\n";
  assert.equal(createHash("sha256").update(body).digest("base64"), tags.bh);
  const remaining = fields.filter((field) => field !== dkim);
  const selected: string[] = [];
  for (const name of tags.h.split(":")) {
    const index = remaining.findLastIndex((field) =>
      field.slice(0, field.indexOf(":")).toLowerCase() === name.toLowerCase()
    );
    if (index >= 0) selected.push(remaining.splice(index, 1)[0]);
  }
  selected.push(dkim.replace(/\bb=[\s\S]*$/, "b="));
  const canonical = selected.map((field) => {
    if (headerMode === "simple") return field;
    const colon = field.indexOf(":");
    return field.slice(0, colon).toLowerCase() + ":" +
      field.slice(colon + 1).replace(/\r\n/g, "").replace(/[ \t]+/g, " ")
        .trim();
  }).join("\r\n");
  const input = new TextEncoder().encode(canonical);
  assert.ok(
    verify(
      tags.a === "rsa-sha256" ? "RSA-SHA256" : null,
      tags.a === "rsa-sha256"
        ? input
        : createHash("sha256").update(input).digest(),
      publicKey,
      Uint8Array.from(atob(tags.b.replace(/\s/g, "")), (c) => c.charCodeAt(0)),
    ),
  );
}

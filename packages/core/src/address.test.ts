import { formatAddress, parseAddress } from "@upyo/core/address";
import assert from "node:assert/strict";
import { test } from "node:test";

test("formatAddress()", () => {
  const addr = formatAddress({ name: "John Doe", address: "john@example.com" });
  assert.strictEqual(addr, "John Doe <john@example.com>");
  const addr2 = formatAddress({ address: "jane@example.com" });
  assert.strictEqual(addr2, "jane@example.com");
});

test("parseAddress()", () => {
  // Test plain email address
  const addr1 = parseAddress("john@example.com");
  assert.deepStrictEqual(addr1, { address: "john@example.com" });

  // Test email with name
  const addr2 = parseAddress("John Doe <john@example.com>");
  assert.deepStrictEqual(addr2, {
    name: "John Doe",
    address: "john@example.com",
  });

  // Test email with quoted name
  const addr3 = parseAddress('"John Doe" <john@example.com>');
  assert.deepStrictEqual(addr3, {
    name: "John Doe",
    address: "john@example.com",
  });

  // Test email with angle brackets only
  const addr4 = parseAddress("<john@example.com>");
  assert.deepStrictEqual(addr4, { address: "john@example.com" });

  // Test complex valid email addresses
  const addr5 = parseAddress("user.name+tag@example.com");
  assert.deepStrictEqual(addr5, { address: "user.name+tag@example.com" });

  const addr6 = parseAddress("test@sub.example.com");
  assert.deepStrictEqual(addr6, { address: "test@sub.example.com" });

  // Test quoted local part
  const addr7 = parseAddress('"test@test"@example.com');
  assert.deepStrictEqual(addr7, { address: '"test@test"@example.com' });

  // Test domain literal
  const addr8 = parseAddress("test@[192.168.1.1]");
  assert.deepStrictEqual(addr8, { address: "test@[192.168.1.1]" });

  // Test invalid addresses - should return undefined
  assert.strictEqual(parseAddress(""), undefined);
  assert.strictEqual(parseAddress("   "), undefined);
  assert.strictEqual(parseAddress("invalid"), undefined);
  assert.strictEqual(parseAddress("@example.com"), undefined);
  assert.strictEqual(parseAddress("user@"), undefined);
  assert.strictEqual(parseAddress("user@@example.com"), undefined);
  assert.strictEqual(parseAddress(".user@example.com"), undefined);
  assert.strictEqual(parseAddress("user.@example.com"), undefined);
  assert.strictEqual(parseAddress("user..name@example.com"), undefined);
  assert.strictEqual(parseAddress("John Doe <invalid>"), undefined);
  assert.strictEqual(parseAddress("<invalid>"), undefined);
  assert.strictEqual(parseAddress("test@[999.999.999.999]"), undefined);

  // Test edge cases
  // deno-lint-ignore no-explicit-any
  assert.strictEqual(parseAddress(null as any), undefined);
  // deno-lint-ignore no-explicit-any
  assert.strictEqual(parseAddress(undefined as any), undefined);
  // deno-lint-ignore no-explicit-any
  assert.strictEqual(parseAddress(123 as any), undefined);
});

test("parseAddress() roundtrip with formatAddress()", () => {
  // Test that parseAddress and formatAddress are inverses
  const testCases = [
    "john@example.com",
    "John Doe <john@example.com>",
    "user.name+tag@example.sub.com",
  ];

  for (const testCase of testCases) {
    const parsed = parseAddress(testCase);
    assert.notStrictEqual(parsed, undefined);
    const formatted = formatAddress(parsed!);
    const reparsed = parseAddress(formatted);
    assert.deepStrictEqual(parsed, reparsed);
  }
});

// cSpell: ignore reparsed

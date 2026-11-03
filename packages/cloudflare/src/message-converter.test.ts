import { createMessage } from "@upyo/core";
import { CloudflareValidationError } from "./errors.ts";
import { convertMessage } from "./message-converter.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("convertMessage", () => {
  it("converts a basic message", async () => {
    const data = await convertMessage(
      createMessage({
        from: "Sender <sender@example.com>",
        to: ["a@example.com", "b@example.com"],
        subject: "Hi",
        content: { text: "Hello" },
      }),
    );
    assert.deepEqual(data.from, {
      address: "sender@example.com",
      name: "Sender",
    });
    assert.deepEqual(data.to, ["a@example.com", "b@example.com"]);
    assert.equal(data.subject, "Hi");
    assert.equal(data.text, "Hello");
    assert.equal(data.html, undefined);
    assert.equal(data.headers, undefined);
  });

  it("handles html, text, cc, bcc and reply-to", async () => {
    const data = await convertMessage(
      createMessage({
        from: "sender@example.com",
        to: "a@example.com",
        cc: "c@example.com",
        bcc: "d@example.com",
        replyTo: "Reply <r@example.com>",
        subject: "Hi",
        content: { html: "<p>x</p>", text: "x" },
      }),
    );
    assert.equal(data.html, "<p>x</p>");
    assert.equal(data.text, "x");
    assert.deepEqual(data.cc, ["c@example.com"]);
    assert.deepEqual(data.bcc, ["d@example.com"]);
    assert.deepEqual(data.reply_to, {
      address: "r@example.com",
      name: "Reply",
    });
  });

  it("converts attachments to base64, including inline ones", async () => {
    const data = await convertMessage(
      createMessage({
        from: "sender@example.com",
        to: "a@example.com",
        subject: "Hi",
        content: { html: '<img src="cid:logo">' },
        attachments: [
          {
            inline: false,
            contentId: "",
            filename: "a.txt",
            content: new TextEncoder().encode("hello"),
            contentType: "text/plain",
          },
          {
            filename: "logo.png",
            content: new Uint8Array([1, 2]),
            contentType: "image/png",
            inline: true,
            contentId: "logo",
          },
        ],
      }),
    );
    assert.deepEqual(data.attachments?.[0], {
      content: "aGVsbG8=",
      filename: "a.txt",
      type: "text/plain",
      disposition: "attachment",
    });
    assert.equal(data.attachments?.[1].content, "AQI=");
    assert.equal(data.attachments?.[1].disposition, "inline");
    assert.equal(data.attachments?.[1].content_id, "logo");
  });

  // Cloudflare rejects an inline part without a content ID with error 10001.
  it("sends an inline part without a content ID as a regular attachment", async () => {
    const data = await convertMessage(
      createMessage({
        from: "sender@example.com",
        to: "a@example.com",
        subject: "Hi",
        content: { text: "x" },
        attachments: [
          {
            inline: true,
            contentId: "",
            filename: "logo.png",
            content: new Uint8Array([1]),
            contentType: "image/png",
          },
        ],
      }),
    );
    assert.equal(data.attachments?.[0].disposition, "attachment");
    assert.ok(!("content_id" in (data.attachments?.[0] ?? {})));
  });

  it("maps priority and passes custom headers through", async () => {
    const data = await convertMessage(
      createMessage({
        from: "sender@example.com",
        to: "a@example.com",
        subject: "Hi",
        content: { text: "x" },
        priority: "high",
        headers: { "List-Unsubscribe": "<https://example.com/u>" },
      }),
    );
    assert.deepEqual(data.headers, {
      "X-Priority": "1",
      "list-unsubscribe": "<https://example.com/u>",
    });
  });

  it("writes threading headers from typed fields", async () => {
    const data = await convertMessage(
      createMessage({
        from: "sender@example.com",
        to: "a@example.com",
        subject: "Hi",
        content: { text: "x" },
        inReplyTo: "parent@example.com",
      }),
    );
    assert.equal(data.headers?.["In-Reply-To"], "<parent@example.com>");
  });

  it("carries a calendar as an invite.ics attachment", async () => {
    const data = await convertMessage(
      createMessage({
        from: "sender@example.com",
        to: "a@example.com",
        subject: "Meet",
        content: { text: "x" },
        calendar: {
          content: [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "PRODID:-//t//t//EN",
            "METHOD:REQUEST",
            "BEGIN:VEVENT",
            "UID:1@example.com",
            "DTSTAMP:20260101T000000Z",
            "DTSTART:20260102T000000Z",
            "SUMMARY:x",
            "END:VEVENT",
            "END:VCALENDAR",
          ].join("\r\n"),
        },
      }),
    );
    assert.equal(data.attachments?.[0].filename, "invite.ics");
  });
});

describe("convertMessage header validation", () => {
  const base = {
    from: "sender@example.com",
    to: "a@example.com",
    subject: "Hi",
    content: { text: "x" },
  } as const;

  function rejectsWith(headers: Record<string, string>, code: string) {
    return assert.rejects(
      convertMessage(createMessage({ ...base, headers })),
      (error: unknown) =>
        error instanceof CloudflareValidationError && error.code === code,
    );
  }

  it("rejects headers that Cloudflare generates itself", async () => {
    for (const name of [
      "Message-ID",
      "Date",
      "MIME-Version",
      "Content-Type",
      "Content-Transfer-Encoding",
      "DKIM-Signature",
      "Return-Path",
      "Received",
      "Feedback-ID",
      "ARC-Seal",
      "TLS-Required",
      "TLS-Report-Domain",
      "TLS-Report-Submitter",
      "CFBL-Address",
      "CFBL-Feedback-ID",
    ]) {
      await rejectsWith({ [name]: "v" }, "cloudflare.header_not_allowed");
    }
  });

  it("rejects headers that belong in a message field", async () => {
    for (const name of ["From", "To", "Cc", "Bcc", "Subject", "Reply-To"]) {
      await rejectsWith({ [name]: "v" }, "cloudflare.header_use_api_field");
    }
  });

  it("names the offending header in the message", async () => {
    await assert.rejects(
      convertMessage(
        createMessage({ ...base, headers: { "Message-ID": "x" } }),
      ),
      /Message-ID/i,
    );
  });

  it("leaves limits and syntax Cloudflare accepts alone", async () => {
    const headers: Record<string, string> = {
      "X-Empty": "",
      "X-Bad.Name": "v",
      "X-Long": "v".repeat(3000),
      "Some-Unknown": "v",
    };
    for (let i = 0; i < 9; i++) headers[`X-H${i}`] = "v".repeat(2000);
    const data = await convertMessage(createMessage({ ...base, headers }));
    assert.equal(data.headers?.["x-empty"], "");
    assert.equal(data.headers?.["x-bad.name"], "v");
    assert.equal(data.headers?.["x-long"]?.length, 3000);
    assert.equal(data.headers?.["some-unknown"], "v");
    assert.equal(Object.keys(data.headers ?? {}).length, 13);
  });

  it("does not send X-Priority twice when the message sets it too", async () => {
    const data = await convertMessage(
      createMessage({
        ...base,
        priority: "high",
        headers: { "X-Priority": "2" },
      }),
    );
    const names = Object.keys(data.headers ?? {}).map((n) => n.toLowerCase());
    assert.equal(names.filter((n) => n === "x-priority").length, 1);
    assert.equal(data.headers?.["x-priority"], "2");
  });

  it("does not turn messageId and date into headers", async () => {
    const data = await convertMessage(
      createMessage({
        ...base,
        messageId: "id@example.com",
        date: new Date("2026-01-01T00:00:00Z"),
      }),
    );
    assert.equal(data.headers, undefined);
  });
});

describe("convertMessage recipients", () => {
  it("keeps display names on to, cc and bcc, mixed with bare addresses", async () => {
    const data = await convertMessage(
      createMessage({
        from: "sender@example.com",
        to: ["Sykez <sykez@example.com>", "cloudflare@example.com"],
        cc: ["Cc <cc@example.com>"],
        bcc: ["Bcc <bcc@example.com>", "bcc2@example.com"],
        subject: "Hi",
        content: { text: "x" },
      }),
    );
    assert.deepEqual(data.to, [
      "Sykez <sykez@example.com>",
      "cloudflare@example.com",
    ]);
    assert.deepEqual(data.cc, ["Cc <cc@example.com>"]);
    assert.deepEqual(data.bcc, ["Bcc <bcc@example.com>", "bcc2@example.com"]);
  });

  it("quotes names that contain special characters", async () => {
    const data = await convertMessage(
      createMessage({
        from: "sender@example.com",
        to: [
          { name: "Support, Team", address: "quoted@example.com" },
          { name: 'Say "hi"', address: "hi@example.com" },
          { name: "Plain Name", address: "plain@example.com" },
        ],
        subject: "Hi",
        content: { text: "x" },
      }),
    );
    assert.deepEqual(data.to, [
      '"Support, Team" <quoted@example.com>',
      '"Say \\"hi\\"" <hi@example.com>',
      "Plain Name <plain@example.com>",
    ]);
  });
});

describe("convertMessage recipient limit", () => {
  const addresses = (prefix: string, n: number) =>
    Array.from({ length: n }, (_, i) => `${prefix}${i}@example.com`);

  it("accepts 50 recipients across to, cc and bcc", async () => {
    const data = await convertMessage(
      createMessage({
        from: "sender@example.com",
        to: addresses("to", 30),
        cc: addresses("cc", 10),
        bcc: addresses("bcc", 10),
        subject: "Hi",
        content: { text: "x" },
      }),
    );
    assert.equal(
      data.to.length + (data.cc?.length ?? 0) + (data.bcc?.length ?? 0),
      50,
    );
  });

  it("rejects 51 recipients across to, cc and bcc", async () => {
    await assert.rejects(
      convertMessage(
        createMessage({
          from: "sender@example.com",
          to: addresses("to", 30),
          cc: addresses("cc", 10),
          bcc: addresses("bcc", 11),
          subject: "Hi",
          content: { text: "x" },
        }),
      ),
      (error: unknown) =>
        error instanceof CloudflareValidationError &&
        error.code === "cloudflare.too_many_recipients" &&
        /51/.test(error.message),
    );
  });
});

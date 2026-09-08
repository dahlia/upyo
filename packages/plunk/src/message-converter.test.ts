import { createMessage } from "@upyo/core";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { convertMessage } from "./message-converter.ts";
import { createPlunkConfig } from "./config.ts";
import type { Message } from "@upyo/core";

describe("convertMessage", () => {
  const config = createPlunkConfig({ apiKey: "test-key" });

  function createTestMessage(overrides: Partial<Message> = {}): Message {
    return {
      sender: { address: "from@example.com", name: "Sender Name" },
      recipients: [{ address: "to@example.com", name: "Recipient Name" }],
      ccRecipients: [],
      bccRecipients: [],
      replyRecipients: [],
      subject: "Test Subject",
      content: { text: "Test message content" },
      attachments: [],
      priority: "normal",
      tags: [],
      headers: new Headers(),
      ...overrides,
    };
  }

  it("should convert basic message fields", async () => {
    const message = createTestMessage();
    const result = await convertMessage(message, config);

    assert.equal(result.to, "to@example.com");
    assert.equal(result.subject, "Test Subject");
    assert.equal(result.body, "Test message content");
    assert.ok(!("subscribed" in result));
    assert.equal(result.name, "Sender Name");
    assert.equal(result.from, "from@example.com");
  });

  it("should handle multiple recipients", async () => {
    const message = createTestMessage({
      recipients: [
        { address: "user1@example.com" },
        { address: "user2@example.com" },
        { address: "user3@example.com" },
      ],
    });

    const result = await convertMessage(message, config);

    assert.deepEqual(result.to, [
      "user1@example.com",
      "user2@example.com",
      "user3@example.com",
    ]);
  });

  it("should handle single recipient as string", async () => {
    const message = createTestMessage({
      recipients: [{ address: "single@example.com" }],
    });

    const result = await convertMessage(message, config);

    assert.equal(result.to, "single@example.com");
  });

  it("should prefer HTML content over text", async () => {
    const message = createTestMessage({
      content: {
        text: "Plain text content",
        html: "<h1>HTML content</h1>",
      },
    });

    const result = await convertMessage(message, config);

    assert.equal(result.body, "<h1>HTML content</h1>");
  });

  it("should use text content when HTML is not available", async () => {
    const message = createTestMessage({
      content: { text: "Plain text only" },
    });

    const result = await convertMessage(message, config);

    assert.equal(result.body, "Plain text only");
  });

  it("should handle empty content", async () => {
    const message = createTestMessage({
      content: { text: "" },
    });

    const result = await convertMessage(message, config);

    assert.equal(result.body, "");
  });

  it("should convert reply-to address", async () => {
    const message = createTestMessage({
      replyRecipients: [
        { address: "reply@example.com", name: "Reply Person" },
        { address: "noreply@example.com" }, // Should use first one
      ],
    });

    const result = await convertMessage(message, config);

    assert.equal(result.reply, "reply@example.com");
  });

  it("should not include reply field when no reply recipients", async () => {
    const message = createTestMessage({
      replyRecipients: [],
    });

    const result = await convertMessage(message, config);

    assert.equal(result.reply, undefined);
  });

  it("should convert custom headers", async () => {
    const headers = new Headers();
    headers.set("X-Custom-Header", "custom-value");
    headers.set("X-Source", "upyo");
    headers.set("To", "should-be-filtered"); // Should be filtered out
    headers.set("From", "should-be-filtered"); // Should be filtered out

    const message = createTestMessage({ headers });
    const result = await convertMessage(message, config);

    assert.deepEqual(result.headers, {
      "x-custom-header": "custom-value",
      "x-source": "upyo",
    });
  });

  it("should not include headers field when no custom headers", async () => {
    const message = createTestMessage();
    const result = await convertMessage(message, config);

    assert.equal(result.headers, undefined);
  });

  it("should filter out standard headers", async () => {
    const headers = new Headers();
    headers.set("content-type", "text/html");
    headers.set("subject", "filtered");
    headers.set("reply-to", "filtered");
    headers.set("X-Keep-This", "keep");

    const message = createTestMessage({ headers });
    const result = await convertMessage(message, config);

    assert.deepEqual(result.headers, {
      "x-keep-this": "keep",
    });
  });

  it("should convert attachments", async () => {
    const textContent = new TextEncoder().encode("Hello, attachment!");

    const message = createTestMessage({
      attachments: [
        {
          filename: "test.txt",
          contentType: "text/plain" as const,
          content: Promise.resolve(textContent),
          inline: false,
          contentId: "",
        },
      ],
    });

    const result = await convertMessage(message, config);

    assert.equal(result.attachments?.length, 1);
    assert.equal(result.attachments?.[0].filename, "test.txt");
    assert.equal(result.attachments?.[0].contentType, "text/plain");

    // Verify base64 encoding
    const expectedBase64 = btoa("Hello, attachment!");
    assert.equal(result.attachments?.[0].content, expectedBase64);
  });

  it("should limit attachments to 5", async () => {
    const content = new TextEncoder().encode("test");
    const attachments = Array.from({ length: 10 }, (_, i) => ({
      filename: `test${i}.txt`,
      contentType: "text/plain" as const,
      content: Promise.resolve(content),
      inline: false,
      contentId: "",
    }));

    const message = createTestMessage({ attachments });
    const result = await convertMessage(message, config);

    assert.equal(result.attachments?.length, 5);
  });

  it("should handle attachment conversion errors gracefully", async () => {
    const message = createTestMessage({
      attachments: [
        {
          filename: "failing.txt",
          contentType: "text/plain" as const,
          content: Promise.reject(new Error("Failed to read")),
          inline: false,
          contentId: "",
        },
        {
          filename: "working.txt",
          contentType: "text/plain" as const,
          content: Promise.resolve(new TextEncoder().encode("works")),
          inline: false,
          contentId: "",
        },
      ],
    });

    const result = await convertMessage(message, config);

    // Should only include the working attachment
    assert.equal(result.attachments?.length, 1);
    assert.equal(result.attachments?.[0].filename, "working.txt");
  });

  it("should not include optional fields when not present", async () => {
    const message = createTestMessage({
      sender: { address: "from@example.com" }, // No name
      replyRecipients: [],
      headers: new Headers(),
      attachments: [],
    });

    const result = await convertMessage(message, config);

    assert.equal(result.name, undefined);
    assert.equal(result.reply, undefined);
    assert.equal(result.headers, undefined);
    assert.equal(result.attachments, undefined);
  });

  it("should include sender name when provided", async () => {
    const message = createTestMessage({
      sender: { address: "from@example.com", name: "John Doe" },
    });

    const result = await convertMessage(message, config);

    assert.equal(result.name, "John Doe");
    assert.equal(result.from, "from@example.com");
  });
});

const threadingConfig = createPlunkConfig({ apiKey: "test-key" });

const headerOf = (headers: Record<string, string>, name: string) =>
  Object.entries(headers)
    .filter(([key]) => key.toLowerCase() === name.toLowerCase())
    .map(([, value]) => value);

describe("convertMessage() reply threading", () => {
  const base = {
    from: "sender@example.com",
    to: "recipient@example.com",
    subject: "Re: Your request",
    content: { text: "Thanks for getting in touch." },
  } as const;

  it("writes the typed threading fields", async () => {
    const message = createMessage({
      ...base,
      inReplyTo: "122@example.com",
      references: ["120@example.com", "121@example.com"],
    });
    const result = (await convertMessage(message, threadingConfig)).headers ??
      {};

    assert.deepEqual(headerOf(result, "In-Reply-To"), ["<122@example.com>"]);
    assert.deepEqual(headerOf(result, "References"), [
      "<120@example.com> <121@example.com>",
    ]);
  });

  it("prefers a typed field over a custom header", async () => {
    const message = createMessage({
      ...base,
      inReplyTo: ["typed@example.com"],
      headers: { "In-Reply-To": "<custom@example.com>" },
    });
    const result = (await convertMessage(message, threadingConfig)).headers ??
      {};

    assert.deepEqual(headerOf(result, "In-Reply-To"), ["<typed@example.com>"]);
  });

  it("lets an empty list suppress a custom header", async () => {
    const message = createMessage({
      ...base,
      inReplyTo: [],
      references: [],
      headers: {
        "In-Reply-To": "<custom@example.com>",
        "References": "<custom@example.com>",
      },
    });
    const result = (await convertMessage(message, threadingConfig)).headers ??
      {};

    assert.deepEqual(headerOf(result, "In-Reply-To"), []);
    assert.deepEqual(headerOf(result, "References"), []);
  });

  it("lets a custom header through when the field is unset", async () => {
    const message = createMessage({
      ...base,
      headers: { "In-Reply-To": "<custom@example.com>" },
    });
    const result = (await convertMessage(message, threadingConfig)).headers ??
      {};

    assert.deepEqual(headerOf(result, "In-Reply-To"), ["<custom@example.com>"]);
  });
});

const CALENDAR_ICS = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "METHOD:REQUEST",
  "BEGIN:VEVENT",
  "UID:1@example.com",
  "SUMMARY:Lunch",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n") + "\r\n";

const CALENDAR_BASE64 = btoa(CALENDAR_ICS);

const AGENDA_ATTACHMENT = {
  inline: false,
  filename: "agenda.txt",
  content: new TextEncoder().encode("agenda"),
  contentType: "text/plain" as const,
  contentId: "",
};

describe("convertMessage() calendar", () => {
  const calendarConfig = createPlunkConfig({ apiKey: "test-key" });

  const invitation = (attachments: typeof AGENDA_ATTACHMENT[] = []) =>
    createMessage({
      from: "organizer@example.com",
      to: "attendee@example.net",
      subject: "Lunch",
      content: { text: "Lunch on Wednesday." },
      calendar: { method: "REQUEST", content: CALENDAR_ICS },
      attachments,
    });

  it("should carry the calendar as an invite.ics attachment", async () => {
    const result = await convertMessage(invitation(), calendarConfig);

    assert.equal(result.attachments?.length, 1);
    assert.equal(result.attachments?.[0].filename, "invite.ics");
    assert.equal(
      result.attachments?.[0].contentType,
      "text/calendar; charset=utf-8; method=REQUEST",
    );
    assert.equal(result.attachments?.[0].content, CALENDAR_BASE64);
  });

  it("should place the invitation ahead of the other attachments", async () => {
    const result = await convertMessage(
      invitation([AGENDA_ATTACHMENT]),
      calendarConfig,
    );

    assert.deepEqual(
      result.attachments?.map((attachment) => attachment.filename),
      ["invite.ics", "agenda.txt"],
    );
  });

  it("should refuse to drop a file to make room for the invitation", async () => {
    // Five files already fill Plunk's limit, so the invitation could only be
    // carried by silently discarding one of them.
    await assert.rejects(
      () =>
        convertMessage(
          invitation(Array(5).fill(AGENDA_ATTACHMENT)),
          calendarConfig,
        ),
      { name: "RangeError", message: /at most five attachments/ },
    );
  });

  it("should still truncate at five when there is no calendar", async () => {
    const result = await convertMessage(
      createMessage({
        from: "organizer@example.com",
        to: "attendee@example.net",
        subject: "Files",
        content: { text: "Files." },
        attachments: Array(6).fill(AGENDA_ATTACHMENT),
      }),
      calendarConfig,
    );

    assert.equal(result.attachments?.length, 5);
  });

  it("should reject calendar content that never passed createMessage()", async () => {
    const message: Message = {
      ...createMessage({
        from: "organizer@example.com",
        to: "attendee@example.net",
        subject: "Lunch",
        content: { text: "Lunch." },
      }),
      calendar: { method: "REQUEST", content: "not a calendar" },
    };

    await assert.rejects(() => convertMessage(message, calendarConfig), {
      name: "TypeError",
    });
  });
});

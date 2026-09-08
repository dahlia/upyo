import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type CalendarConstructor,
  createCalendarAttachment,
  parseCalendarMethod,
  resolveCalendarContent,
} from "./calendar.ts";
import { readAttachmentContent } from "./attachment.ts";

/** Builds an iCalendar object from lines, with the CRLF endings RFC 5545 asks
 * for. */
function ics(...lines: readonly string[]): string {
  return lines.join("\r\n") + "\r\n";
}

const request = ics(
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//Upyo//Test//EN",
  "METHOD:REQUEST",
  "BEGIN:VEVENT",
  "UID:1@example.com",
  "DTSTAMP:20260901T100000Z",
  "DTSTART:20260902T100000Z",
  "SUMMARY:Lunch",
  "END:VEVENT",
  "END:VCALENDAR",
);

describe("parseCalendarMethod()", () => {
  it("should read a top-level METHOD", () => {
    assert.equal(parseCalendarMethod(request), "REQUEST");
  });

  it("should accept every iTIP method", () => {
    const methods = [
      "PUBLISH",
      "REQUEST",
      "REPLY",
      "ADD",
      "CANCEL",
      "REFRESH",
      "COUNTER",
      "DECLINECOUNTER",
    ] as const;
    for (const method of methods) {
      const content = ics(
        "BEGIN:VCALENDAR",
        `METHOD:${method}`,
        "END:VCALENDAR",
      );
      assert.equal(parseCalendarMethod(content), method);
    }
  });

  it("should uppercase a lowercase value and property name", () => {
    const content = ics("BEGIN:VCALENDAR", "method:request", "END:VCALENDAR");
    assert.equal(parseCalendarMethod(content), "REQUEST");
  });

  it("should still fold ASCII component names case-insensitively", () => {
    const content = ics("begin:vcalendar", "METHOD:REQUEST", "end:vcalendar");
    assert.equal(parseCalendarMethod(content), "REQUEST");
  });

  it("should accept bare LF line endings", () => {
    assert.equal(
      parseCalendarMethod(
        "BEGIN:VCALENDAR\nMETHOD:CANCEL\nEND:VCALENDAR\n",
      ),
      "CANCEL",
    );
  });

  it("should unfold a folded property line", () => {
    const content = ics(
      "BEGIN:VCALENDAR",
      "METHOD:REQ",
      " UEST",
      "END:VCALENDAR",
    );
    assert.equal(parseCalendarMethod(content), "REQUEST");
  });

  it("should tolerate property parameters", () => {
    const content = ics(
      "BEGIN:VCALENDAR",
      "METHOD;X-FOO=bar:REQUEST",
      "END:VCALENDAR",
    );
    assert.equal(parseCalendarMethod(content), "REQUEST");
  });

  it("should ignore a colon inside a quoted parameter value", () => {
    const content = ics(
      "BEGIN:VCALENDAR",
      'METHOD;X-FOO="a:b":REPLY',
      "END:VCALENDAR",
    );
    assert.equal(parseCalendarMethod(content), "REPLY");
  });

  it("should ignore a METHOD nested in a component", () => {
    const content = ics(
      "BEGIN:VCALENDAR",
      "BEGIN:VTIMEZONE",
      "METHOD:REQUEST",
      "END:VTIMEZONE",
      "END:VCALENDAR",
    );
    assert.equal(parseCalendarMethod(content), undefined);
  });

  it("should read a METHOD written after a component", () => {
    const content = ics(
      "BEGIN:VCALENDAR",
      "BEGIN:VTIMEZONE",
      "TZID:UTC",
      "END:VTIMEZONE",
      "METHOD:CANCEL",
      "END:VCALENDAR",
    );
    assert.equal(parseCalendarMethod(content), "CANCEL");
  });

  it("should not read a METHOD from a property value", () => {
    const content = ics(
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "DESCRIPTION:METHOD:REQUEST",
      "END:VEVENT",
      "END:VCALENDAR",
    );
    assert.equal(parseCalendarMethod(content), undefined);
  });

  const rejected: Record<string, string> = {
    "no METHOD": ics("BEGIN:VCALENDAR", "VERSION:2.0", "END:VCALENDAR"),
    "an unsupported method": ics(
      "BEGIN:VCALENDAR",
      "METHOD:X-CUSTOM",
      "END:VCALENDAR",
    ),
    // U+017F upper-cases to "S" and U+0131 to "I" under the full Unicode
    // mapping, which would turn an invalid token into a supported one while the
    // payload kept the character a calendar client cannot read.
    "a method spelled with U+017F": ics(
      "BEGIN:VCALENDAR",
      "METHOD:reque\u017Ft",
      "END:VCALENDAR",
    ),
    "a method spelled with U+0131": ics(
      "BEGIN:VCALENDAR",
      "METHOD:publ\u0131sh",
      "END:VCALENDAR",
    ),
    "two top-level METHODs": ics(
      "BEGIN:VCALENDAR",
      "METHOD:REQUEST",
      "METHOD:CANCEL",
      "END:VCALENDAR",
    ),
    "no envelope": "METHOD:REQUEST\r\n",
    "an unterminated envelope": ics("BEGIN:VCALENDAR", "METHOD:REQUEST"),
    "unbalanced components": ics(
      "BEGIN:VCALENDAR",
      "METHOD:REQUEST",
      "BEGIN:VEVENT",
      "END:VCALENDAR",
    ),
    "an unterminated quote": ics(
      "BEGIN:VCALENDAR",
      'METHOD;X-FOO="a:REQUEST',
      "END:VCALENDAR",
    ),
    "an orphan continuation line": " METHOD:REQUEST\r\n",
    // Unfolding joins a continuation to the line *immediately* before it, so a
    // blank line in between must not let one bridge the gap and manufacture a
    // method the transmitted content does not declare.
    "a continuation across a blank line": ics(
      "BEGIN:VCALENDAR",
      "METHOD:REQ",
      "",
      " UEST",
      "END:VCALENDAR",
    ),
    "a blank line inside the object": ics(
      "BEGIN:VCALENDAR",
      "METHOD:REQUEST",
      "",
      "END:VCALENDAR",
    ),
    "an empty string": "",
  };
  for (const [description, content] of Object.entries(rejected)) {
    it(`should return undefined for ${description}`, () => {
      assert.equal(parseCalendarMethod(content), undefined);
    });
  }
});

describe("resolveCalendarContent()", () => {
  it("should resolve the method from the content", () => {
    const resolved = resolveCalendarContent({ content: request });
    assert.equal(resolved.method, "REQUEST");
    assert.equal(resolved.content, request);
  });

  it("should accept a method that agrees with the content", () => {
    const resolved = resolveCalendarContent({
      method: "REQUEST",
      content: request,
    });
    assert.equal(resolved.method, "REQUEST");
  });

  it("should normalize bare LF endings to CRLF", () => {
    const resolved = resolveCalendarContent({
      content: "BEGIN:VCALENDAR\nMETHOD:REQUEST\nEND:VCALENDAR\n",
    });
    assert.equal(
      resolved.content,
      "BEGIN:VCALENDAR\r\nMETHOD:REQUEST\r\nEND:VCALENDAR\r\n",
    );
  });

  it("should normalize bare CR endings to CRLF", () => {
    const resolved = resolveCalendarContent({
      content: "BEGIN:VCALENDAR\rMETHOD:REQUEST\rEND:VCALENDAR\r",
    });
    assert.equal(
      resolved.content,
      "BEGIN:VCALENDAR\r\nMETHOD:REQUEST\r\nEND:VCALENDAR\r\n",
    );
  });

  it("should accept blank lines around the object", () => {
    // A template literal opening with a newline, or a file saved with a
    // trailing blank line, is ordinary; nothing can fold across an edge.
    const resolved = resolveCalendarContent({
      content: "\n\nBEGIN:VCALENDAR\nMETHOD:REQUEST\nEND:VCALENDAR\n\n\n",
    });

    assert.equal(resolved.method, "REQUEST");
    assert.equal(
      resolved.content,
      "BEGIN:VCALENDAR\r\nMETHOD:REQUEST\r\nEND:VCALENDAR\r\n",
    );
  });

  it("should still reject a blank line inside the object", () => {
    assert.throws(
      () =>
        resolveCalendarContent({
          content: ics(
            "BEGIN:VCALENDAR",
            "METHOD:REQ",
            "",
            " UEST",
            "END:VCALENDAR",
          ),
        }),
      { name: "TypeError", message: /empty line/ },
    );
  });

  it("should add a terminating CRLF when the content lacks one", () => {
    const resolved = resolveCalendarContent({
      content: "BEGIN:VCALENDAR\r\nMETHOD:REQUEST\r\nEND:VCALENDAR",
    });
    assert.ok(resolved.content.endsWith("END:VCALENDAR\r\n"));
  });

  it("should preserve the caller's line folding", () => {
    const folded = ics(
      "BEGIN:VCALENDAR",
      "METHOD:REQUEST",
      "BEGIN:VEVENT",
      "SUMMARY:A very long summary that the caller chose to",
      "  fold across two lines",
      "END:VEVENT",
      "END:VCALENDAR",
    );
    const resolved = resolveCalendarContent({ content: folded });
    assert.equal(resolved.content, folded);
  });

  it("should preserve non-ASCII content", () => {
    const content = ics(
      "BEGIN:VCALENDAR",
      "METHOD:REQUEST",
      "BEGIN:VEVENT",
      "SUMMARY:점심 식사 🍜",
      "END:VEVENT",
      "END:VCALENDAR",
    );
    assert.equal(resolveCalendarContent({ content }).content, content);
  });

  it("should reject a method that disagrees with the content", () => {
    assert.throws(
      () => resolveCalendarContent({ method: "CANCEL", content: request }),
      { name: "TypeError", message: /METHOD/ },
    );
  });

  it("should reject content with no METHOD even when one is asserted", () => {
    assert.throws(
      () =>
        resolveCalendarContent({
          method: "REQUEST",
          content: ics("BEGIN:VCALENDAR", "VERSION:2.0", "END:VCALENDAR"),
        }),
      { name: "TypeError", message: /METHOD/ },
    );
  });

  const invalid: Record<string, CalendarConstructor> = {
    "an empty object": { content: "" },
    "a missing envelope": { content: "METHOD:REQUEST\r\n" },
    "an unsupported method": {
      content: ics("BEGIN:VCALENDAR", "METHOD:X-CUSTOM", "END:VCALENDAR"),
    },
    "a method a Unicode fold would rescue": {
      content: ics("BEGIN:VCALENDAR", "METHOD:reque\u017Ft", "END:VCALENDAR"),
    },
    "two calendar objects": {
      content: ics("BEGIN:VCALENDAR", "METHOD:REQUEST", "END:VCALENDAR") +
        ics("BEGIN:VCALENDAR", "METHOD:REQUEST", "END:VCALENDAR"),
    },
    // RFC 5545 has no VCALENDAR inside a VCALENDAR, and the components balance
    // here, so nothing else in the scan would notice.
    "a nested calendar object": {
      content: ics(
        "BEGIN:VCALENDAR",
        "METHOD:REQUEST",
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "END:VCALENDAR",
        "END:VCALENDAR",
      ),
    },
    "a nested object declaring its own method": {
      content: ics(
        "BEGIN:VCALENDAR",
        "METHOD:REQUEST",
        "BEGIN:VCALENDAR",
        "METHOD:CANCEL",
        "END:VCALENDAR",
        "END:VCALENDAR",
      ),
    },
  };
  for (const [description, calendar] of Object.entries(invalid)) {
    it(`should reject ${description}`, () => {
      assert.throws(() => resolveCalendarContent(calendar), {
        name: "TypeError",
      });
    });
  }
});

describe("createCalendarAttachment()", () => {
  it("should build an invite.ics part carrying the method", async () => {
    const attachment = createCalendarAttachment({ content: request });
    assert.ok(!attachment.inline);
    assert.equal(attachment.filename, "invite.ics");
    assert.equal(
      attachment.contentType,
      "text/calendar; charset=utf-8; method=REQUEST",
    );
    assert.equal(attachment.contentId, "");
    const bytes = await readAttachmentContent(attachment.content);
    assert.equal(new TextDecoder().decode(bytes), request);
  });

  it("should carry the normalized content", async () => {
    const attachment = createCalendarAttachment({
      content: "BEGIN:VCALENDAR\nMETHOD:CANCEL\nEND:VCALENDAR",
    });
    assert.equal(
      attachment.contentType,
      "text/calendar; charset=utf-8; method=CANCEL",
    );
    const bytes = await readAttachmentContent(attachment.content);
    assert.equal(
      new TextDecoder().decode(bytes),
      "BEGIN:VCALENDAR\r\nMETHOD:CANCEL\r\nEND:VCALENDAR\r\n",
    );
  });

  it("should reject invalid calendar content", () => {
    assert.throws(() => createCalendarAttachment({ content: "nope" }), {
      name: "TypeError",
    });
  });
});

describe("createCalendarAttachment() charset", () => {
  it("should declare UTF-8 so non-ASCII content decodes", () => {
    // RFC 6047 §2.4 requires the charset parameter once the object leaves
    // US-ASCII, and MIME's default would otherwise mis-read these bytes.
    const attachment = createCalendarAttachment({
      content: ics(
        "BEGIN:VCALENDAR",
        "METHOD:REQUEST",
        "BEGIN:VEVENT",
        "SUMMARY:점심 식사",
        "END:VEVENT",
        "END:VCALENDAR",
      ),
    });

    assert.ok(attachment.contentType.includes("charset=utf-8"));
  });
});

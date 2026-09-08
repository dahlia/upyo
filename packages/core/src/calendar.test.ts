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

  it("should accept a multi-valued parameter", () => {
    const content = ics(
      "BEGIN:VCALENDAR",
      "METHOD;X-A=a,b:REQUEST",
      "END:VCALENDAR",
    );
    assert.equal(parseCalendarMethod(content), "REQUEST");
  });

  it("should accept an empty parameter value", () => {
    const content = ics(
      "BEGIN:VCALENDAR",
      "METHOD;X-A=:REQUEST",
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

  it("should accept an extension component name", () => {
    const content = ics(
      "BEGIN:VCALENDAR",
      "METHOD:REQUEST",
      "BEGIN:X-WR-THING",
      "END:X-WR-THING",
      "END:VCALENDAR",
    );
    assert.equal(parseCalendarMethod(content), "REQUEST");
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
    // A parameter is `name=value`, so a bare token is not one.  The method it
    // declares would be composed into a Content-Type while the content line
    // carrying it is one a calendar client may refuse.
    "a METHOD with a malformed parameter": ics(
      "BEGIN:VCALENDAR",
      "METHOD;BROKEN:REQUEST",
      "END:VCALENDAR",
    ),
    "a METHOD with an unnamed parameter": ics(
      "BEGIN:VCALENDAR",
      "METHOD;=bar:REQUEST",
      "END:VCALENDAR",
    ),
    // A component name is an iana-token or an x-name, both of which are one
    // or more of ALPHA, DIGIT and "-".  A malformed pair still balances.
    "an empty component name": ics(
      "BEGIN:VCALENDAR",
      "METHOD:REQUEST",
      "BEGIN:",
      "END:",
      "END:VCALENDAR",
    ),
    "a component name carrying spaces": ics(
      "BEGIN:VCALENDAR",
      "METHOD:REQUEST",
      "BEGIN:NOT A TOKEN",
      "END:NOT A TOKEN",
      "END:VCALENDAR",
    ),
    "a quoted component name": ics(
      "BEGIN:VCALENDAR",
      "METHOD:REQUEST",
      'BEGIN:"X"',
      'END:"X"',
      "END:VCALENDAR",
    ),
    // RFC 5545 §3.4 spells a delimiter BEGIN:<name>, with no parameters.  A
    // matching pair carrying them balances, so nothing else would notice.
    "a BEGIN carrying parameters": ics(
      "BEGIN;X=foo:VCALENDAR",
      "METHOD:REQUEST",
      "END;X=foo:VCALENDAR",
    ),
    "an END carrying parameters": ics(
      "BEGIN:VCALENDAR",
      "METHOD:REQUEST",
      "END;X=foo:VCALENDAR",
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

describe("calendar content line grammar", () => {
  const invalidLines: Readonly<Record<string, readonly string[]>> = {
    "spaces in a property name": ["SUM MARY:x"],
    "quoted property name": ['"SUMMARY":x'],
    "empty property name": [":x"],
    "non-ASCII property name": ["SUMMÁRY:x"],
    "punctuation in a property name": ["SUM_MARY:x"],
    "bare parameter": ["SUMMARY;BROKEN:Lunch"],
    "unnamed parameter": ["SUMMARY;=x:y"],
    "empty trailing parameter": ["SUMMARY;X=a;:y"],
    "invalid parameter name": ["SUMMARY;X_A=x:y"],
    "non-ASCII parameter name": ["SUMMARY;X-Á=x:y"],
    "space in a parameter name": ["SUMMARY;X A=x:y"],
    "quoted parameter name": ['SUMMARY;"X"=x:y'],
    "embedded balanced quotes": ['METHOD;X=a"b":REQUEST'],
    "junk after a quoted value": ['METHOD;X="a"b:REQUEST'],
    "adjacent quoted values": ['METHOD;X="a""b":REQUEST'],
    "space after a quoted value": ['METHOD;X="a" :REQUEST'],
    "unterminated quoted value": ['SUMMARY;X="a:b'],
    "missing colon after quoted value": ['SUMMARY;X="a"'],
    "missing colon": ["SUMMARY"],
    "backslash before an embedded quote": ['METHOD;X="a\\"b":REQUEST'],
    "malformed nested METHOD": [
      "BEGIN:VEVENT",
      "METHOD;BROKEN:REQUEST",
      "END:VEVENT",
    ],
    "leading method whitespace": ["METHOD: REQUEST"],
    "trailing method whitespace": ["METHOD:REQUEST "],
    "lone high surrogate": ["SUMMARY:\uD83D"],
    "lone low surrogate": ["SUMMARY:\uDE00"],
    "surrogate pair split by folding": ["SUMMARY:\uD83D", " \uDE00"],
  };

  // Only the METHOD-specific cases replace the valid top-level method.
  function objectWith(lines: readonly string[]): string {
    return ics(
      "BEGIN:VCALENDAR",
      ...(lines[0].startsWith("METHOD") ? [] : ["METHOD:REQUEST"]),
      ...lines,
      "END:VCALENDAR",
    );
  }

  for (const [description, lines] of Object.entries(invalidLines)) {
    it(`should reject ${description} through both public functions`, () => {
      const content = objectWith(lines);
      assert.equal(parseCalendarMethod(content), undefined);
      assert.throws(() => resolveCalendarContent({ content }), TypeError);
    });
  }

  for (let code = 0; code <= 0x7f; code++) {
    if (
      code === 9 || code === 10 || code === 13 || (code >= 32 && code < 127)
    ) {
      continue;
    }
    const character = String.fromCharCode(code);
    for (
      const line of [
        `SUMMARY:a${character}b`,
        `METHOD;X=a${character}b:REQUEST`,
        `METHOD;X="a${character}b":REQUEST`,
      ]
    ) {
      it(`should reject control U+${code.toString(16)} in ${JSON.stringify(line)}`, () => {
        const content = objectWith([line]);
        assert.equal(parseCalendarMethod(content), undefined);
        assert.throws(() => resolveCalendarContent({ content }), TypeError);
      });
    }
  }

  for (const value of ["\uD800", "\uDC00"]) {
    for (const parameter of [value, `"${value}"`]) {
      it(`should reject a lone surrogate in parameter ${JSON.stringify(parameter)}`, () => {
        const content = objectWith([`METHOD;X=${parameter}:REQUEST`]);
        assert.equal(parseCalendarMethod(content), undefined);
        assert.throws(() => resolveCalendarContent({ content }), TypeError);
      });
    }
  }

  it("should reject a byte order mark before the envelope", () => {
    const content = "\uFEFF" + request;
    assert.equal(parseCalendarMethod(content), undefined);
    assert.throws(() => resolveCalendarContent({ content }), TypeError);
  });

  const validLines: Readonly<Record<string, readonly string[]>> = {
    "empty parameter values and list members": ['METHOD;X=,"",a,,b,:REQUEST'],
    "mixed quoted and unquoted values": ['METHOD;X="a:b;c,d",plain,"":REQUEST'],
    "equals, backslash and caret in parameters": [
      "METHOD;X=a=b\\c^n^'^^:REQUEST",
    ],
    "spaces and tabs in parameters": ['METHOD;X= a\tb ;Y=" a\tb ":REQUEST'],
    "Unicode parameter and property values": [
      'ATTENDEE;CN="점심 🍜";X=é\u0080\u0085\u009F:mailto:a@example.com',
      "SUMMARY:점심 🍜\uD7FF\uE000\uFFFF\u{10FFFF}",
    ],
    "unknown token names": ["X-ABC-THING;X-ABC-PARAM=x:y", "1;-=x:y", "X-:x"],
    "empty property value": ["SUMMARY:"],
    "realistic attendee parameters": [
      "ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN=Jane Doe;X-NUM-GUESTS=0:mailto:jane@example.net",
      'ATTENDEE;CN="Doe, Jane":mailto:jane@example.net',
    ],
    "structured values": [
      "DTSTART;TZID=America/New_York:20260902T100000",
      "RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261231T000000Z",
      "GEO:37.386013;-122.082932",
      'X-ALT-DESC;FMTTYPE=text/html:<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 3.2//EN">',
      "ATTACH;FMTTYPE=text/plain;ENCODING=BASE64;VALUE=BINARY:SGVsbG8=",
      "DESCRIPTION:Line one\\nLine two\\, with comma",
    ],
    "property name folding": ["ME", " THOD:REQUEST"],
    "parameter name folding": ["METHOD;X-", " A=1:REQUEST"],
    "quoted parameter folding": [
      'ATTENDEE;CN="Doe,',
      '  Jane":mailto:jane@example.net',
    ],
    "fold immediately after colon": ["METHOD:", " REQUEST"],
    "fold after a closing quote": ['METHOD;X="a"', " ,b:REQUEST"],
    "tab-led continuation": ["METHOD:REQ", "\tUEST"],
    "long unfolded line": ["SUMMARY:" + "x".repeat(100)],
    "parameterized nested METHOD": [
      "BEGIN:VEVENT",
      "METHOD;X-A=1:CANCEL",
      "END:VEVENT",
    ],
  };
  for (const [description, lines] of Object.entries(validLines)) {
    it(`should preserve ${description}`, () => {
      // A folded property name does not begin with METHOD until unfolded.
      const content = description === "property name folding"
        ? ics("BEGIN:VCALENDAR", ...lines, "END:VCALENDAR")
        : objectWith(lines);
      assert.equal(parseCalendarMethod(content), "REQUEST");
      assert.deepEqual(resolveCalendarContent({ content }), {
        method: "REQUEST",
        content,
      });
    });
  }

  it("should normalize a bare LF fold without removing it from output", () => {
    const content =
      "BEGIN:VCALENDAR\nMETHOD:REQUEST\nSUMMARY:a\n b\nEND:VCALENDAR\n";
    assert.equal(parseCalendarMethod(content), "REQUEST");
    assert.equal(
      resolveCalendarContent({ content }).content,
      content.replaceAll("\n", "\r\n"),
    );
  });

  it("should accept the documented invitation", () => {
    const content = ics(
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Example//Booking//EN",
      "METHOD:REQUEST",
      "BEGIN:VEVENT",
      "UID:booking-42@example.com",
      "SEQUENCE:0",
      "DTSTAMP:20260901T090000Z",
      "DTSTART:20260902T120000Z",
      "DTEND:20260902T130000Z",
      "ORGANIZER:mailto:organizer@example.com",
      "ATTENDEE;RSVP=TRUE:mailto:attendee@example.net",
      "SUMMARY:Lunch",
      "END:VEVENT",
      "END:VCALENDAR",
    );
    assert.deepEqual(resolveCalendarContent({ content }), {
      method: "REQUEST",
      content,
    });
  });

  it("should refuse malformed lines when creating the attachment fallback", () => {
    assert.throws(() =>
      createCalendarAttachment({
        content: objectWith(["SUMMARY;BROKEN:Lunch"]),
      }), TypeError);
  });
});

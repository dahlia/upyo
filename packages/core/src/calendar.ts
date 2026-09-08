/**
 * Scheduling messages: the iCalendar payload a message carries alongside its
 * human-readable body, and the pieces a transport needs to compose it.
 *
 * Upyo does not generate iCalendar objects.  The application, or a library such
 * as *ical-generator*, produces the object; Upyo owns the MIME composition
 * around it, which is what makes a calendar client recognize a message as an
 * invitation rather than as a file to download.
 *
 * @module
 * @since 0.6.0
 */

import type { Attachment } from "./attachment.ts";

/**
 * An iTIP method, naming what a scheduling message does.
 *
 * These are the methods registered by RFC 5546 §1.4.  A method written as an
 * `x-name` or as an unregistered IANA token is rejected rather than passed
 * through, because the value is written into a `Content-Type` parameter and has
 * to agree with the calendar object that carries it.
 *
 * @since 0.6.0
 */
export type CalendarMethod =
  | "PUBLISH"
  | "REQUEST"
  | "REPLY"
  | "ADD"
  | "CANCEL"
  | "REFRESH"
  | "COUNTER"
  | "DECLINECOUNTER";

const calendarMethods: ReadonlySet<string> = new Set<CalendarMethod>([
  "PUBLISH",
  "REQUEST",
  "REPLY",
  "ADD",
  "CANCEL",
  "REFRESH",
  "COUNTER",
  "DECLINECOUNTER",
]);

/**
 * The scheduling payload of a message, in the form a transport serializes.
 *
 * This is what {@link Message.calendar} holds.  Both fields are settled: the
 * method has been checked against the calendar object's own `METHOD` property,
 * and the content carries the CRLF line endings RFC 5545 §3.1 makes normative.
 *
 * @since 0.6.0
 */
export interface CalendarContent {
  /**
   * The method the calendar object declares, which the MIME `method` parameter
   * repeats.
   */
  readonly method: CalendarMethod;

  /**
   * The iCalendar object, with CRLF line endings and a terminating CRLF.
   */
  readonly content: string;
}

/**
 * The scheduling payload in the looser form a caller supplies.
 *
 * This is what {@link MessageConstructor.calendar} accepts.  Line endings are
 * normalized and the method is resolved when the message is created.
 *
 * @since 0.6.0
 */
export interface CalendarConstructor {
  /**
   * Asserts which method the calendar object carries.
   *
   * This is a guard, not a source: the resolved method always comes from the
   * object's own `METHOD` property, and supplying a value that disagrees with
   * it is an error rather than an override.  Leave it unset unless you want the
   * check.
   */
  readonly method?: CalendarMethod;

  /**
   * The iCalendar object.  Bare LF and bare CR line endings are accepted and
   * normalized to CRLF; the object's own line folding is left alone.
   */
  readonly content: string;
}

/**
 * Reads the method a calendar object declares.
 *
 * This is a convenience parser for a payload arriving from elsewhere, so it
 * returns `undefined` rather than throwing, the way {@link parseMessageId}
 * does.  It answers one question—which iTIP method does this object declare?—
 * and answers `undefined` whenever it cannot answer with confidence: no
 * `METHOD` at the top level, more than one, a method Upyo does not support, or
 * an envelope it cannot make sense of.  It never salvages a plausible token
 * from malformed input.
 *
 * Use {@link resolveCalendarContent} instead when you want to know *why* a
 * payload was refused.
 *
 * @example
 * ```ts
 * import { parseCalendarMethod } from "@upyo/core/calendar";
 * parseCalendarMethod("BEGIN:VCALENDAR\r\nMETHOD:REQUEST\r\nEND:VCALENDAR\r\n");
 * // "REQUEST"
 * ```
 *
 * @param content The iCalendar object to read.
 * @returns The declared method, or `undefined` if there is not exactly one
 *          supported top-level method.
 * @since 0.6.0
 */
export function parseCalendarMethod(
  content: string,
): CalendarMethod | undefined {
  if (typeof content !== "string") return undefined;
  try {
    return readMethod(normalizeLineEndings(content));
  } catch {
    return undefined;
  }
}

/**
 * Checks a scheduling payload and puts it in the form a transport serializes.
 *
 * A transport calls this before composing, the way it calls
 * {@link formatMessageId}: {@link Message} is a structural interface, so a
 * value that never passed through {@link createMessage} still has to be checked
 * before its method reaches a `Content-Type` parameter.
 *
 * This is deliberately not a full iCalendar validator.  It checks what MIME
 * composition depends on—that there is one calendar object, that its components
 * balance, and that it declares exactly one supported method—and leaves the
 * rest to the caller.  Whether the object names an `ORGANIZER`, carries a
 * stable `UID`, bumps `SEQUENCE` on an update, or satisfies the iTIP
 * constraints for its method is not checked here.
 *
 * @example
 * ```ts
 * import { resolveCalendarContent } from "@upyo/core/calendar";
 * const calendar = resolveCalendarContent({ content: ics });
 * calendar.method;  // "REQUEST"
 * ```
 *
 * @param calendar The payload to check.
 * @returns The payload with CRLF line endings and a resolved method.
 * @throws {TypeError} If the content is not a single well-formed calendar
 * object, if it does not declare exactly one supported method, or if it
 * declares a method other than the one asserted.
 * @since 0.6.0
 */
export function resolveCalendarContent(
  calendar: CalendarConstructor,
): CalendarContent {
  const content = normalizeLineEndings(calendar.content ?? "");
  const method = readMethod(content);
  if (method == null) {
    throw new TypeError(
      "The calendar content declares no supported top-level METHOD property.  " +
        "Add one, such as `METHOD:REQUEST`, to the VCALENDAR object: RFC 6047 " +
        "§2.4 requires the MIME method parameter to repeat it, and a calendar " +
        "client reads the property rather than the parameter.",
    );
  }
  if (calendar.method != null && calendar.method !== method) {
    throw new TypeError(
      `The calendar content declares METHOD:${method}, but ${
        JSON.stringify(calendar.method)
      } was given.  Leave the method unset to take it from the content.`,
    );
  }
  return { method, content };
}

/**
 * Builds the *invite.ics* part that stands in for a calendar alternative.
 *
 * A transport that cannot compose a `text/calendar` body alternative falls back
 * to this, so the payload travels rather than being dropped.  The part keeps
 * the calendar media type and the `method` parameter, which is what a client
 * needs to treat it as scheduling content, but whether a provider preserves
 * that parameter is the provider's business; see the transport's documentation.
 *
 * The content ID is empty, which marks the part as an ordinary attachment
 * across the transports that infer inline disposition from one.
 *
 * @param calendar The payload to carry.
 * @returns An attachment holding the calendar object.
 * @throws {TypeError} If the payload is not valid; see
 * {@link resolveCalendarContent}.
 * @since 0.6.0
 */
export function createCalendarAttachment(
  calendar: CalendarConstructor,
): Attachment {
  const resolved = resolveCalendarContent(calendar);
  return {
    inline: false,
    filename: "invite.ics",
    content: new TextEncoder().encode(resolved.content),
    // The charset is declared because RFC 6047 §2.4 requires it once the object
    // leaves US-ASCII, and MIME would otherwise default to it and mis-read the
    // UTF-8 bytes encoded above.
    contentType: `text/calendar; charset=utf-8; method=${resolved.method}`,
    contentId: "",
  };
}

/**
 * Normalizes line endings to CRLF and ensures a terminating one.
 *
 * RFC 5545 §3.1 makes CRLF the line ending of a content line, but a caller
 * routinely holds an object with bare LFs, whether from a template file or from
 * a generator that never wrote it to the wire.  Bare CR is normalized too, so
 * that an old-Mac-style payload does not read as one enormous line.
 *
 * Blank lines around the object are dropped: a template literal opening with a
 * newline, or a file saved with a trailing blank line, is ordinary, and no
 * folded continuation can reach across an edge.  A blank line *inside* the
 * object is left for {@link unfold} to refuse.
 *
 * @param content The object to normalize.
 * @returns The object with CRLF line endings, or the empty string unchanged.
 */
function normalizeLineEndings(content: string): string {
  const normalized = content
    .replace(/\r\n|\r|\n/g, "\r\n")
    .replace(/^(?:\r\n)+/, "")
    .replace(/(?:\r\n)+$/, "");
  return normalized === "" ? "" : `${normalized}\r\n`;
}

/**
 * Reads the one top-level method of a well-formed calendar object.
 *
 * Top level means the component stack is exactly `VCALENDAR`: a `METHOD` inside
 * `VEVENT` or `VTIMEZONE` is a different property that happens to share a name,
 * and a `METHOD:` appearing inside a property value is text.  Scanning
 * continues past components rather than stopping at the first, so a second
 * top-level `METHOD` written after one is still noticed.
 *
 * @param content The object, already normalized to CRLF.
 * @returns The declared method, or `undefined` if there is not exactly one that
 *          Upyo supports.
 * @throws {TypeError} If the content is not a single well-formed calendar
 * object.
 */
function readMethod(content: string): CalendarMethod | undefined {
  const stack: string[] = [];
  let closed = false;
  let method: CalendarMethod | undefined;
  let methods = 0;

  for (const line of unfold(content)) {
    const { name, value } = splitProperty(line);
    if (name === "BEGIN") {
      if (closed) {
        throw new TypeError(
          "The calendar content holds more than one VCALENDAR object, but a " +
            "message carries one.",
        );
      }
      if (stack.length < 1 && value !== "VCALENDAR") {
        throw new TypeError(
          `The calendar content begins with ${
            JSON.stringify(value)
          } rather than a VCALENDAR object.`,
        );
      }
      stack.push(value);
      continue;
    }
    if (name === "END") {
      if (stack.pop() !== value) {
        throw new TypeError(
          `The calendar content closes ${
            JSON.stringify(value)
          } that was never opened.`,
        );
      }
      if (stack.length < 1) closed = true;
      continue;
    }
    if (stack.length < 1) {
      throw new TypeError(
        "The calendar content holds a property outside any VCALENDAR object.",
      );
    }
    if (name === "METHOD" && stack.length === 1) {
      methods++;
      method = calendarMethods.has(value) ? value as CalendarMethod : undefined;
    }
  }

  if (stack.length > 0) {
    throw new TypeError(
      `The calendar content leaves ${
        JSON.stringify(stack[stack.length - 1])
      } unclosed.`,
    );
  }
  if (!closed) {
    throw new TypeError("The calendar content holds no VCALENDAR object.");
  }
  return methods === 1 ? method : undefined;
}

/**
 * Splits a content line into its property name and value.
 *
 * The value begins after the first colon that is not inside a quoted parameter
 * value, so `METHOD;X-FOO="a:b":REQUEST` yields `REQUEST` rather than `b"`.
 * iCalendar parameter syntax has no backslash escaping, so none is recognized.
 * Both halves are upper-cased: RFC 5545 property names are case-insensitive,
 * and every value compared here is a token.
 *
 * @param line One unfolded content line.
 * @returns The upper-cased name and value.
 * @throws {TypeError} If the line has no value separator, or leaves a parameter
 * value quoted open.
 */
function splitProperty(line: string): { name: string; value: string } {
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const character = line[i];
    if (character === '"') quoted = !quoted;
    else if (character === ":" && !quoted) {
      const name = line.slice(0, i).split(";", 1)[0];
      return {
        name: name.toUpperCase(),
        value: line.slice(i + 1).toUpperCase(),
      };
    }
  }
  throw new TypeError(
    quoted
      ? `The calendar content leaves a parameter value quoted open: ${
        JSON.stringify(line)
      }`
      : `The calendar content holds a line with no value: ${
        JSON.stringify(line)
      }`,
  );
}

/**
 * Unfolds the content lines of a calendar object.
 *
 * RFC 5545 §3.1 folds a long line by inserting CRLF and *one* space or tab,
 * which unfolding removes.  Only that one character is removed: the rest of a
 * whitespace run belongs to the value.  A `\n` written inside a property value
 * is an escape sequence rather than a line ending and is left alone, which
 * falls out of splitting on CRLF alone.
 *
 * A continuation joins the line immediately before it, so an empty line is
 * refused rather than skipped over.  Skipping one would let a continuation
 * reach across the gap and assemble a property the transmitted content does not
 * actually hold — a `METHOD` in particular, which would then contradict the
 * MIME parameter naming it.  An iCalendar object has no empty content lines
 * anyway.
 *
 * @param content The object, already normalized to CRLF.
 * @returns The unfolded content lines, without their endings.
 * @throws {TypeError} If the content opens with a continuation line, or holds
 * an empty one.
 */
function unfold(content: string): string[] {
  const split = content.split("\r\n");
  // The terminating CRLF leaves a final empty element that is not a line.
  if (split[split.length - 1] === "") split.pop();

  const lines: string[] = [];
  for (const line of split) {
    if (line === "") {
      throw new TypeError("The calendar content holds an empty line.");
    }
    if (line.startsWith(" ") || line.startsWith("\t")) {
      if (lines.length < 1) {
        throw new TypeError(
          "The calendar content opens with a folded continuation line.",
        );
      }
      lines[lines.length - 1] += line.slice(1);
      continue;
    }
    lines.push(line);
  }
  return lines;
}

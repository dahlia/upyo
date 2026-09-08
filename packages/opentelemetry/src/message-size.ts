import type { Message } from "@upyo/core";

const encoder = new TextEncoder();

/**
 * Counts a string in UTF-8 bytes rather than UTF-16 code units.
 *
 * `String.prototype.length` counts code units, which undercounts every
 * character outside the Basic Latin block: a Korean subject is a third of its
 * real size, an emoji a half.  The size these estimates report is in bytes, so
 * they have to be counted that way.
 *
 * @param text The string to measure.
 * @returns The number of bytes the string occupies in UTF-8.
 */
function utf8Length(text: string): number {
  return encoder.encode(text).length;
}

/**
 * Estimates the wire size of a message, in bytes.
 *
 * This is an estimate, not a measurement: the header block is a flat guess, and
 * an attachment contributes only its framing rather than its content, which
 * would mean reading every attachment to report a span attribute.  What it does
 * count, it counts in the units it claims.
 *
 * @param message The message to measure.
 * @returns The estimated size in bytes.
 */
export function estimateMessageSize(message: Message): number {
  let size = 0;

  // Headers estimate (rough)
  size += 500;

  // Subject
  size += utf8Length(message.subject);

  // Content
  if ("html" in message.content) {
    size += utf8Length(message.content.html);
    if (message.content.text) {
      size += utf8Length(message.content.text);
    }
  } else {
    size += utf8Length(message.content.text);
  }

  // Calendar payload, which travels in full whichever way a transport
  // carries it
  if (message.calendar != null) {
    size += utf8Length(message.calendar.content);
  }

  // Attachments estimate (metadata only, not content)
  size += message.attachments.length * 100;

  return size;
}

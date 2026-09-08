---
links:
  '#63': https://github.com/dahlia/upyo/issues/63
  '#69': https://github.com/dahlia/upyo/pull/69
  '#70': https://github.com/dahlia/upyo/issues/70
  '#71': https://github.com/dahlia/upyo/pull/71
---
 -  Added a `calendar` field to `Message` and `createMessage()`, which carries
    an iCalendar object so that a transport can compose the `text/calendar`
    part that makes a message a meeting invitation, a reply, or a
    cancellation.  The method is read from the object's own `METHOD` property;
    passing `method` asserts what that property says rather than supplying it,
    and content that is not a single well-formed `VCALENDAR` object declaring
    exactly one supported method is rejected with a `TypeError`.  Every content
    line is checked for valid names, parameters, and value characters;
    property-specific value syntax and scheduling requirements remain the
    caller's responsibility.  Line endings are normalized to CRLF.
    [[#63], [#69], [#70], [#71]]

 -  Added the `@upyo/core/calendar` module, with the `CalendarMethod`,
    `CalendarContent`, and `CalendarConstructor` types and the
    `parseCalendarMethod()`, `resolveCalendarContent()`, and
    `createCalendarAttachment()` functions.  [[#63], [#69]]

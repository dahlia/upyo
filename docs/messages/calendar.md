---
description: >-
  Learn how to send meeting invitations, replies, and cancellations with Upyo by
  attaching an iCalendar object to a message, and which transports compose it as
  a calendar alternative.
---

Calendar invitations
====================

An appointment confirmation, a reservation, or a meeting invitation is more than
an email with a date in it.  A calendar client offers to add the event, or shows
accept and decline buttons, when the message carries a `text/calendar` body part
whose `method` parameter repeats the iCalendar object's own `METHOD` property,
as [RFC 6047] describes.  Attaching an *.ics* file by hand does not produce that
structure.

The `calendar` field on `createMessage()` takes the iCalendar object and lets
the transport compose the rest:

~~~~ typescript twoslash
declare const ics: string;
// ---cut-before---
import { createMessage } from "@upyo/core";

const message = createMessage({
  from: "organizer@example.com",
  to: "attendee@example.net",
  subject: "Lunch on Wednesday",
  content: {
    text: "Lunch on Wednesday at noon.  Details are in the invitation.",
  },
  calendar: { content: ics },
});
~~~~

[RFC 6047]: https://www.rfc-editor.org/rfc/rfc6047


Upyo does not generate iCalendar objects
----------------------------------------

The `content` is an iCalendar object your application already has, whether from
a template, from your own code, or from a library such as [ical-generator].
Upyo reads it only far enough to compose the message around it, and everything
about the event itself stays yours:

 -  `ORGANIZER` and `ATTENDEE`, which decide who the invitation is from and who
    may reply to it.  These are separate fields from the message's `from` and
    `to`, but they have to agree: [RFC 6047] §2.2 has the receiving side
    authorize a scheduling message by matching the sender against `ORGANIZER`
    for a `REQUEST` or a `CANCEL`, and against `ATTENDEE` for a `REPLY`.  An
    invitation sent from a no-reply address on behalf of an organizer is well
    formed and still gets treated as forwarded, or refused an RSVP.
 -  A `UID` that stays the same across the whole life of the event, and a
    `SEQUENCE` that increases every time you change it.  A client matches an
    update or a cancellation to the original by `UID`, and ignores one whose
    `SEQUENCE` has not advanced.
 -  `DTSTAMP`, `DTSTART`, and any `VTIMEZONE` the event needs.

[RFC 5546] specifies what each method requires.  Getting this wrong produces a
message that is well formed and still does nothing useful, so it is worth
reading before sending invitations to real people.

[ical-generator]: https://github.com/sebbo2002/ical-generator
[RFC 5546]: https://www.rfc-editor.org/rfc/rfc5546


The method comes from the object
--------------------------------

Upyo takes the method from the object's own `METHOD` property, so the object has
to declare one.  This is not a formality: where the MIME parameter and the
`METHOD` property disagree, Outlook uses the property and ignores the parameter,
so a method supplied anywhere else could not change what a recipient sees.

The optional `method` field asserts what the object says rather than supplying
it.  Use it when you want the mismatch caught:

~~~~ typescript twoslash
import { createMessage } from "@upyo/core";

const invitation = [
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
].join("\r\n");

const message = createMessage({
  from: "organizer@example.com",
  to: "attendee@example.net",
  subject: "Lunch on Wednesday",
  content: { text: "Lunch on Wednesday at noon." },
  calendar: { method: "REQUEST", content: invitation },
});
~~~~

An object declaring a different method, or none at all, is rejected with a
`TypeError` rather than sent as something a client will mishandle.  Line endings
are normalized to the CRLF [RFC 5545] requires, so an object held with plain
newlines works as it is.

Upyo checks that the content is a single well-formed `VCALENDAR` object
declaring exactly one supported method.  It is not a full iCalendar validator:
whether the event itself makes sense is still yours to get right.

[RFC 5545]: https://www.rfc-editor.org/rfc/rfc5545


Replies and cancellations
-------------------------

The three methods an application usually needs are `REQUEST` for an invitation,
`REPLY` for an answer to one, and `CANCEL` for calling it off.  `PUBLISH`,
`ADD`, `REFRESH`, `COUNTER`, and `DECLINECOUNTER` are accepted too.

A cancellation is an ordinary message carrying an object with `METHOD:CANCEL`,
the same `UID` as the invitation, and a higher `SEQUENCE`:

~~~~ typescript twoslash
declare const cancellation: string;
// ---cut-before---
import { createMessage } from "@upyo/core";

const message = createMessage({
  from: "organizer@example.com",
  to: "attendee@example.net",
  subject: "Cancelled: Lunch on Wednesday",
  content: { text: "Wednesday's lunch is cancelled." },
  calendar: { method: "CANCEL", content: cancellation },
});
~~~~

A reply reverses the direction: the attendee sends it to the organizer, and the
object carries `METHOD:REPLY` with that one attendee's `PARTSTAT`.  Nothing
about the transport changes.


Write the human-readable body too
---------------------------------

`content` is still required, and it still matters.  A recipient whose client
knows nothing about scheduling sees that and nothing else, so it should say what
the invitation says.

There is a second reason to keep them consistent: on import, Outlook replaces
the calendar object's `DESCRIPTION` with the first `text/html` alternative in
the message.  A mismatch between the two shows up as an event whose description
contradicts the mail it arrived in.


Transport support
-----------------

Composing a `text/calendar` alternative requires a transport that builds the
message structure itself.  Only two do; the rest hand a provider a subject, a
body, and a list of files.

| Transport          | Calendar handling                         |
| ------------------ | ----------------------------------------- |
| *@upyo/smtp*       | Composed as a `text/calendar` alternative |
| *@upyo/jmap*       | Composed as a `text/calendar` alternative |
| *@upyo/mailgun*    | Sent as an *invite.ics* attachment        |
| *@upyo/sendgrid*   | Sent as an *invite.ics* attachment        |
| *@upyo/mailtrap*   | Sent as an *invite.ics* attachment        |
| *@upyo/maileroo*   | Sent as an *invite.ics* attachment        |
| *@upyo/lettermint* | Sent as an *invite.ics* attachment        |
| *@upyo/resend*     | Sent as an *invite.ics* attachment        |
| *@upyo/plunk*      | Sent as an *invite.ics* attachment        |
| *@upyo/ses*        | Sent as an *invite.ics* attachment        |

The composing transports place the calendar last inside a
`multipart/alternative`, after the text and HTML bodies, which is the order
[RFC 2046] §5.1.4 gives for increasing preference.  *@upyo/smtp* encodes the
part as Base64, which keeps the object's line structure exactly as written;
*@upyo/jmap* hands the object to the server, which picks the transfer encoding
itself.

“Sent as an attachment” describes Upyo, not the provider.  Those APIs take a
text body, an HTML body, and files; none of them offers a third body
alternative, so the object travels as a part named *invite.ics* whose content
type keeps the `method` parameter.  That is a real degradation rather than a
different spelling of the same thing: whether a given provider preserves the
parameter, and whether a given client then treats the part as an invitation
rather than as a download, has not been verified per provider.  If the
scheduling semantics matter, send through *@upyo/smtp* or *@upyo/jmap*.

The attachment is placed ahead of your own files, so a client looking for the
first calendar part in the message finds the invitation.  *@upyo/plunk* carries
at most five attachments, and rather than quietly drop one of yours to make room
it refuses a calendar message that would exceed the limit.  *@upyo/resend* sends
a calendar message individually rather than through its batch API, which accepts
no attachments.

> [!NOTE]
> Upyo's tests assert the MIME structure, and the JMAP composition is verified
> against a real server.  They do not assert what Gmail, Outlook, or Apple Mail
> do with the result.  Send yourself a test invitation before promising anyone
> that RSVP works.

[RFC 2046]: https://www.rfc-editor.org/rfc/rfc2046


Recipients and privacy
----------------------

The addresses in the message and the addresses in the calendar object are
separate, and only the first are hidden by `bcc`.  Upyo never writes a `Bcc`
header, so a blind recipient stays hidden from the others—but every recipient
receives the same iCalendar object, and any address written into an `ATTENDEE`
property is in it.

An invitation whose attendee list is private therefore needs a separate message
per recipient, each carrying an object naming only that attendee.  This is also
what `REPLY` needs anyway, since a reply speaks for one attendee.

Upyo changelog
==============

Version 0.6.1
-------------

To be released.


Version 0.6.0
-------------

Released on September 9, 2026.

### @upyo/core

 -  Added `Blob` and replayable async content factories for attachments, with
    `readAttachmentContent()` and `iterateAttachmentContent()` helpers.
    `createMessage()` now retains `File` content without reading it; use the
    helpers instead of awaiting `attachment.content` directly.  [[#56], [#59]]
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
 -  Added `messageId`, `date`, `inReplyTo`, and `references` fields to `Message`
    and `createMessage()`, so that an application can choose the outgoing
    message identifier, store it, and correlate a reply that arrives with a
    matching `In-Reply-To`.  The identifiers are held without their enclosing
    angle brackets, which `createMessage()` strips when they are supplied, and
    an invalid one is rejected with a `TypeError`.  For `inReplyTo` and
    `references`, leaving the field unset defers to an `In-Reply-To` or
    `References` header supplied through `headers`, while an empty array
    suppresses it.
    [[#58], [#61]]
 -  Added the `@upyo/core/message-id` module, with `generateMessageId()`,
    `parseMessageId()`, `formatMessageId()`, and `resolveThreadingHeaders()`.
    [[#58], [#61]]
 -  Clarified that `Receipt.messageId` is the delivery handle a transport or a
    provider reports back, which is not the RFC 5322 `Message-ID` the message
    carries.  [[#58], [#61]]
 -  Added support for internationalized mailbox addresses, including UTF-8
    local parts and Unicode domains, to `parseAddress()` and `createMessage()`.
    [[#45], [#50]]
 -  Added the optional `RawTransport` interface and replayable `RawMessage`
    types for delivering serialized MIME with an explicit envelope. Raw sources
    support incremental validation and cancellation. An explicit `8bit` encoding
    requires the caller to guarantee ASCII headers in nested MIME parts, which
    Upyo does not parse. [[#64], [#72]]
 -  Added the optional `VerifiableTransport` interface and
    `isVerifiableTransport()` type guard for checking transport configuration
    without sending a message.  [[#67], [#73]]

[#45]: https://github.com/dahlia/upyo/issues/45
[#50]: https://github.com/dahlia/upyo/pull/50
[#56]: https://github.com/dahlia/upyo/issues/56
[#58]: https://github.com/dahlia/upyo/issues/58
[#59]: https://github.com/dahlia/upyo/pull/59
[#61]: https://github.com/dahlia/upyo/pull/61
[#63]: https://github.com/dahlia/upyo/issues/63
[#64]: https://github.com/dahlia/upyo/issues/64
[#67]: https://github.com/dahlia/upyo/issues/67
[#69]: https://github.com/dahlia/upyo/pull/69
[#70]: https://github.com/dahlia/upyo/issues/70
[#71]: https://github.com/dahlia/upyo/pull/71
[#72]: https://github.com/dahlia/upyo/pull/72
[#73]: https://github.com/dahlia/upyo/pull/73

### @upyo/jmap

 -  A message carrying `calendar` is now composed with a `text/calendar` body
    part carrying the `method` parameter.  [[#63], [#69]]
 -  Added `JmapTransport.sendRaw()` to stream serialized MIME through blob
    upload, import, and submission with an explicit envelope. Raw mutations are
    not retried automatically; uncertain submission outcomes are reported as
    non-retryable to prevent duplicate delivery. HTTP failures retain their
    status, retry delay, and response details; authentication rejections are
    non-retryable even without a JMAP error body. [[#64], [#72]]
 -  Added `JmapTransport.verify()` to check live session, account, drafts
    mailbox, and identity settings without sending mail or changing the session
    cache. Verification rejects on failure and bounds each discovery operation,
    including response bodies and retries, by the configured timeout.
    [[#67], [#73]]
 -  Fixed cancellation during JMAP retry delays so cancelled requests stop
    waiting immediately.
 -  Added support for `Blob` and replayable async attachment factories,
    including cancellation while reading their content.  Provider payloads
    remain buffered in memory.  [[#56], [#59]]
 -  Added support for the `messageId`, `date`, `inReplyTo`, and `references`
    fields of `Message`, which map onto the `messageId`, `sentAt`, `inReplyTo`,
    and `references` properties of the JMAP `Email` object.  A raw header of the
    same name is dropped when the corresponding field is set, since RFC 8621
    §4.6 forbids two properties representing one header field.  [[#58], [#61]]
 -  Fixed `Email/set` creating an email with the `headers` property, which
    RFC 8621 §4.6 forbids on create; each header field is now written as an
    individual `header:` property.  Custom headers that duplicate a structured
    property, including `Bcc` and any `Content-*` field, are no longer sent, and
    a header value containing a carriage return or line feed is rejected.
    *Breaking*: `JmapEmailCreate` no longer has a `headers` property.
    [[#58], [#61]]
 -  Fixed an empty `text` or `html` body being dropped from the composed
    message.  A body the caller supplied as an empty string is now sent as an
    empty part, the way *@upyo/smtp* composes it, rather than omitted.  [[#69]]

### @upyo/lettermint

 -  A message carrying `calendar` now sends the iCalendar object as an
    *invite.ics* attachment whose content type keeps the `method` parameter,
    ahead of the message's own attachments.  This transport cannot compose a
    `text/calendar` body alternative, so the scheduling semantics are not
    guaranteed to survive; see the documentation on calendar invitations.
    [[#63], [#69]]
 -  Added support for `Blob` and replayable async attachment factories,
    including cancellation while reading their content.  Provider payloads
    remain buffered in memory.  [[#56], [#59]]
 -  Added support for the `inReplyTo` and `references` fields of `Message`,
    which are sent as custom headers.  A field left unset defers to an
    `In-Reply-To` or `References` header supplied through `headers`, and an
    empty array suppresses it.
    `messageId` and `date` are not sent, because the provider does not document
    whether a supplied value survives.  [[#58], [#61]]

### @upyo/logtape

 -  Added LogTape observability transport.
    [[#33]]

     -  Added `LogTapeTransport` class for logging email delivery lifecycle
        events with configurable categories and levels.
     -  Supports log-only development use and decorating another transport
        without changing its receipts or errors.
     -  Supports optional full-message recording as structured properties or
        as development-friendly logs with inline subjects and bodies.
     -  Supports streaming `sendMany()`, `AbortSignal` cancellation, and
        wrapped transport disposal.

[#33]: https://github.com/dahlia/upyo/pull/33

### @upyo/maileroo

 -  A message carrying `calendar` now sends the iCalendar object as an
    *invite.ics* attachment whose content type keeps the `method` parameter,
    ahead of the message's own attachments.  This transport cannot compose a
    `text/calendar` body alternative, so the scheduling semantics are not
    guaranteed to survive; see the documentation on calendar invitations.
    [[#63], [#69]]

 -  Added [Maileroo] transport.
    [[#30], [#31]]

     -  Added `MailerooTransport` class.
     -  Added `MailerooConfig` interface.
     -  Added `ResolvedMailerooConfig` type.
     -  Added `MailerooApiError` class.
     -  Added `MailerooTimeoutError` class.
     -  Supports single sends, sequential `sendMany()`, attachments, inline
        images, custom headers, tags, tracking settings, retries, structured
        failure receipts, and `AbortSignal` cancellation.

 -  Added support for `Blob` and replayable async attachment factories,
    including cancellation while reading their content.  Provider payloads
    remain buffered in memory.  [[#56], [#59]]

 -  Added support for the `inReplyTo` and `references` fields of `Message`,
    which are sent as custom headers.  A field left unset defers to an
    `In-Reply-To` or `References` header supplied through `headers`, and an
    empty array suppresses it.
    `messageId` and `date` are not sent, because the provider does not document
    whether a supplied value survives.  [[#58], [#61]]

[Maileroo]: https://maileroo.com/
[#30]: https://github.com/dahlia/upyo/issues/30
[#31]: https://github.com/dahlia/upyo/pull/31

### @upyo/mailgun

 -  A message carrying `calendar` now sends the iCalendar object as an
    *invite.ics* attachment whose content type keeps the `method` parameter,
    ahead of the message's own attachments.  This transport cannot compose a
    `text/calendar` body alternative, so the scheduling semantics are not
    guaranteed to survive; see the documentation on calendar invitations.
    [[#63], [#69]]
 -  Added support for `Blob` and replayable async attachment factories,
    including cancellation while reading their content.  Provider payloads
    remain buffered in memory.  [[#56], [#59]]
 -  Added support for the `inReplyTo` and `references` fields of `Message`,
    which are sent as custom headers.  A field left unset defers to an
    `In-Reply-To` or `References` header supplied through `headers`, and an
    empty array suppresses it.
    `messageId` and `date` are not sent, because the provider does not document
    whether a supplied value survives.  [[#58], [#61]]

### @upyo/mailtrap

 -  A message carrying `calendar` now sends the iCalendar object as an
    *invite.ics* attachment whose content type keeps the `method` parameter,
    ahead of the message's own attachments.  This transport cannot compose a
    `text/calendar` body alternative, so the scheduling semantics are not
    guaranteed to survive; see the documentation on calendar invitations.
    [[#63], [#69]]

 -  Added [Mailtrap] transport.
    [[#32] by Narek Hovhannisyan\]

     -  Added `MailtrapTransport` class.
     -  Added `MailtrapConfig` interface.
     -  Added `ResolvedMailtrapConfig` type.
     -  Added `MailtrapApiError` class.
     -  Added `MailtrapTimeoutError` class.
     -  Added `MailtrapResponseError` class for unreadable successful responses.
        These failures are not retried, and their failure receipts are marked
        as non-retryable, including when reading the response times out.
     -  Supports Email API and Email Sandbox sending, batch sends,
        attachments, categories, custom variables, config-level metadata,
        structured failure receipts, and `AbortSignal` cancellation.

 -  Added support for `Blob` and replayable async attachment factories,
    including cancellation while reading their content.  Provider payloads
    remain buffered in memory.  [[#56], [#59]]

 -  Added support for the `inReplyTo` and `references` fields of `Message`,
    which are sent as custom headers.  A field left unset defers to an
    `In-Reply-To` or `References` header supplied through `headers`, and an
    empty array suppresses it.
    `messageId` and `date` are not sent, because the provider does not document
    whether a supplied value survives.  [[#58], [#61]]

[Mailtrap]: https://mailtrap.io/
[#32]: https://github.com/dahlia/upyo/pull/32

### @upyo/mime

 -  Added *@upyo/mime* with `composeMessage()` for composing replayable MIME
    bytes without a transport connection, with optional DKIM signing.  Save
    the bytes as an *.eml* file or pass the result directly to SMTP or JMAP
    `sendRaw()`.  The package supports Node.js, Deno, Bun, and edge runtimes
    without Node.js compatibility.  Address line breaks and invalid custom
    header names are rejected even for directly constructed messages.
    [[#68], [#74]]

[#68]: https://github.com/dahlia/upyo/issues/68
[#74]: https://github.com/dahlia/upyo/pull/74

### @upyo/opentelemetry

 -  Fixed the `email.content.type` span attribute and the `content_type` metric
    label, which reported `text` or `html` for a message carrying a calendar.
    Such a message is multipart on every transport, either as a
    `text/calendar` alternative or as an *invite.ics* attachment, and is now
    labelled `multipart`.  [[#69]]
 -  Fixed the estimated message size reported on a span and in the
    `email.message.size` histogram, which counted UTF-16 code units rather than
    the bytes it claimed.  A subject or body outside Basic Latin was
    undercounted, a Korean one by roughly two thirds.  [[#69]]
 -  The estimated message size reported on a span now includes the calendar
    payload.  [[#63], [#69]]

### @upyo/plunk

 -  A message carrying `calendar` now sends the iCalendar object as an
    *invite.ics* attachment whose content type keeps the `method` parameter,
    ahead of the message's own attachments.  This transport cannot compose a
    `text/calendar` body alternative, so the scheduling semantics are not
    guaranteed to survive; see the documentation on calendar invitations.
    [[#63], [#69]]
 -  A calendar message that would exceed the limit of five attachments is now
    rejected with a `RangeError`, rather than silently dropping one of the
    message's own files to make room for the invitation.  [[#63], [#69]]
 -  Added support for `Blob` and replayable async attachment factories.
    Attachment reads remain buffered, and failed reads still omit the
    attachment; caller cancellation now aborts the send instead.  [[#56], [#59]]
 -  Added support for the `inReplyTo` and `references` fields of `Message`,
    which are sent as custom headers.  A field left unset defers to an
    `In-Reply-To` or `References` header supplied through `headers`, and an
    empty array suppresses it.
    `messageId` and `date` are not sent, because the provider does not document
    whether a supplied value survives.  [[#58], [#61]]

### @upyo/resend

 -  A message carrying `calendar` now sends the iCalendar object as an
    *invite.ics* attachment whose content type keeps the `method` parameter,
    ahead of the message's own attachments.  This transport cannot compose a
    `text/calendar` body alternative, so the scheduling semantics are not
    guaranteed to survive; see the documentation on calendar invitations.
    [[#63], [#69]]
 -  A calendar message is now sent individually rather than through the batch
    API, which accepts no attachments.  [[#63], [#69]]
 -  Added support for `Blob` and replayable async attachment factories,
    including cancellation while reading their content.  Provider payloads
    remain buffered in memory.  [[#56], [#59]]
 -  Added support for the `inReplyTo` and `references` fields of `Message`,
    which are sent as custom headers.  A field left unset defers to an
    `In-Reply-To` or `References` header supplied through `headers`, and an
    empty array suppresses it.
    `messageId` and `date` are not sent, because the provider does not document
    whether a supplied value survives.  [[#58], [#61]]
 -  Fixed incorrect Base64 padding that corrupted attachment contents.  [[#59]]

### @upyo/sendgrid

 -  A message carrying `calendar` now sends the iCalendar object as an
    *invite.ics* attachment whose content type keeps the `method` parameter,
    ahead of the message's own attachments.  This transport cannot compose a
    `text/calendar` body alternative, so the scheduling semantics are not
    guaranteed to survive; see the documentation on calendar invitations.
    [[#63], [#69]]
 -  Added support for `Blob` and replayable async attachment factories,
    including cancellation while reading their content.  Provider payloads
    remain buffered in memory.  [[#56], [#59]]
 -  Added support for the `inReplyTo` and `references` fields of `Message`,
    which are sent as custom headers.  A field left unset defers to an
    `In-Reply-To` or `References` header supplied through `headers`, and an
    empty array suppresses it.
    `messageId` and `date` are not sent, because the provider does not document
    whether a supplied value survives.  [[#58], [#61]]

### @upyo/ses

 -  A message carrying `calendar` now sends the iCalendar object as an
    *invite.ics* attachment whose content type keeps the `method` parameter,
    ahead of the message's own attachments.  This transport cannot compose a
    `text/calendar` body alternative, so the scheduling semantics are not
    guaranteed to survive; see the documentation on calendar invitations.
    [[#63], [#69]]
 -  An attachment with no content ID no longer sends an empty `ContentId` field.
    [[#63], [#69]]
 -  Added support for `Blob` and replayable async attachment factories,
    including cancellation while reading their content.  Provider payloads
    remain buffered in memory.  [[#56], [#59]]

### @upyo/smtp

 -  A message carrying `calendar` is now composed with a `text/calendar`
    alternative, placed after the text and HTML bodies and Base64 encoded so
    that the object's line structure survives unchanged.  The `method`
    parameter repeats the object's own `METHOD` property, as RFC 6047 §2.4
    requires.  [[#63], [#69]]
 -  Added SMTP envelope overrides for using different `MAIL FROM` and `RCPT TO`
    addresses without changing the visible message headers.  Overrides support
    null reverse-paths and per-message resolvers for bulk VERP delivery.
    [[#52], [#54]]
 -  Added `SmtpTransport.sendRaw()` for delivering serialized MIME with an
    explicit envelope, streaming validation, DSN, and cancellation. Raw sends
    preserve existing headers and signatures and bypass configured DKIM signing.
    [[#64], [#72]]
 -  Added `SmtpTransport.verify()` to check a fresh connection, TLS policy, and
    configured authentication without sending mail.  Verification shares the
    connection limit, closes its connection afterward, and rejects on failure.
    `SmtpResponseError` and `SmtpAuthResponseError` are now exported for
    inspecting server replies.  [[#67], [#73]]
 -  Fixed cancellation during SMTP connection setup and while waiting for a
    custom OAuth2 token provider, so cancelled operations release their
    connections promptly.
 -  Added automatic SMTPUTF8 delivery for internationalized sender, recipient,
    and reply-to addresses, as well as internationalized nested MIME and DKIM
    headers.  Servers must advertise `SMTPUTF8` and `8BITMIME`;
    unsupported sends fail without starting a mail transaction.  [[#45], [#50]]
 -  Added incremental SMTP attachment encoding and backpressured DATA writes.
    Set `dkim.bodyMode` to `"streaming"` for bounded attachment memory with two
    source reads, or keep the default `"buffered"` mode for one read.  Changed
    replay content fails with `smtp.attachment-replay-mismatch` before
    acceptance. Source inactivity and size-limit failures close unfinished DATA
    connections. [[#56], [#59]]
 -  Added structured enhanced status codes to SMTP delivery failures.  Valid
    RFC 2034 reply prefixes expose their class, subject, and detail while
    preserving the server's original text; address, content, and network
    statuses also receive more specific error categories.  [[#46], [#51]]
 -  Added support for the `messageId`, `date`, `inReplyTo`, and `references`
    fields of `Message`.  Each takes precedence over the matching `Message-ID`,
    `Date`, `In-Reply-To`, or `References` header, which still applies when the
    field is left unset.  [[#58], [#61]]
 -  Changed the generated `Message-ID` to use the sender's domain instead of the
    fixed `upyo.local`, which RFC 6762 reserves for multicast DNS.
    [[#58], [#61]]
 -  Fixed the `Date` header ending in the obsolete `GMT` zone rather than the
    numeric `+0000` RFC 5322 §3.3 asks for.  [[#58], [#61]]
 -  Fixed SMTPUTF8 not being negotiated for a non-ASCII value in a header field
    written verbatim, such as a `Message-ID` supplied as a custom header.
    [[#58], [#61]]
 -  Changed `In-Reply-To` and `References` supplied as custom headers to be
    written verbatim rather than RFC 2047 encoded, since both carry structured
    values that the encoding made invalid.  A non-ASCII value in one therefore
    now requires a server that advertises SMTPUTF8, and a value containing a
    carriage return or line feed is rejected instead of being neutralized by
    the encoding.  [[#58], [#61]]
 -  Added the `requireTls` configuration option.  When enabled for a plaintext
    connection, the transport issues `STARTTLS` even if the server does not
    advertise it and fails delivery unless the TLS upgrade succeeds.  The
    option defaults to `false`; the existing protection against cleartext
    authentication to non-loopback hosts remains in effect.  STARTTLS on Deno
    requires Deno 2.7.13 or later.
 -  Fixed connection pooling when `pool` is omitted so that the documented
    default of `true` takes effect.  Dispose the transport with `await using` or
    call `closeAllConnections()` to release pooled connections when finished.
 -  Reduced SMTP round trips by sending `MAIL FROM` and all `RCPT TO` commands
    together when the server advertises the `PIPELINING` extension.  Replies,
    including multiline replies, remain associated with their commands and
    rejected recipients in server response order.
    [[#42], [#47]]
 -  Added support for the SMTP `SIZE` extension.  The transport declares each
    encoded message's size on `MAIL FROM` and returns a failed receipt before
    uploading messages that exceed an advertised fixed maximum.  Bare `SIZE`
    and `SIZE 0` advertisements continue without a local limit.
    [[#43], [#48]]
 -  Added SMTP delivery status notification requests through the RFC 3461
    `DSN` extension.  Per-message `RET` and `ENVID` options and per-recipient
    `NOTIFY` and `ORCPT` options are validated and serialized on the SMTP
    envelope.  Requests fail before `MAIL FROM` when the server does not
    advertise `DSN`.
    [[#44], [#49]]
 -  Fixed DKIM signatures using `ed25519-sha256` or `simple` header
    canonicalization failing verification by receiving mail servers.
 -  Fixed SMTP connections to infer the `secure` default from the port.  Port
    465 uses implicit TLS; all other ports start with plaintext and upgrade with
    STARTTLS when advertised.  Set `secure: true` explicitly to use implicit
    TLS on a nonstandard port.  [[#53], [#55]]
 -  Fixed quoted-printable encoding of CRLF, isolated line endings, trailing
    spaces, and long lines so messages preserve their text and respect MIME
    line limits.  Inline Content-ID headers now reject values that cannot fit
    the RFC 5322 line limit.  Directly constructed messages now reject address
    line breaks and invalid custom header names.  [[#68], [#74]]

[#42]: https://github.com/dahlia/upyo/issues/42
[#43]: https://github.com/dahlia/upyo/issues/43
[#44]: https://github.com/dahlia/upyo/issues/44
[#46]: https://github.com/dahlia/upyo/issues/46
[#47]: https://github.com/dahlia/upyo/pull/47
[#48]: https://github.com/dahlia/upyo/pull/48
[#49]: https://github.com/dahlia/upyo/pull/49
[#51]: https://github.com/dahlia/upyo/pull/51
[#52]: https://github.com/dahlia/upyo/issues/52
[#53]: https://github.com/dahlia/upyo/issues/53
[#54]: https://github.com/dahlia/upyo/pull/54
[#55]: https://github.com/dahlia/upyo/pull/55


Version 0.5.6
-------------

Released on September 9, 2026.

### @upyo/smtp

 -  Fixed `closeAllConnections()` and async disposal leaving connections open
    when sends were still in progress.  Shutdown now waits for previously
    started sends, including those waiting for a connection, and closes their
    connections instead of returning them to the pool.  New sends wait until
    shutdown completes, after which the transport can be reused.  Finish or
    return any started `sendMany()` iteration before awaiting shutdown.
    [[#66]]

 -  Added regression coverage for the `sendMany()` connection cleanup fix
    introduced in 0.5.5.  Breaking out of the iteration releases the connection
    without sending the remaining messages, with pooling enabled or disabled
    and with synchronous or asynchronous message sources.  [[#65]]

[#65]: https://github.com/dahlia/upyo/issues/65
[#66]: https://github.com/dahlia/upyo/issues/66


Version 0.5.5
-------------

Released on September 8, 2026.

### @upyo/smtp

 -  `SmtpConfig.poolSize` is now enforced as a hard limit on how many
    connections one transport may have open at the same time.  Concurrent
    `send()` and `sendMany()` calls used to open a connection each, so a
    transport configured with `poolSize: 5` could open a hundred connections
    for a hundred concurrent sends and trip a provider's
    simultaneous-connection limit.  A call that arrives once the limit is
    reached now waits for a connection to be handed back, and cancelling it
    through its `AbortSignal` rejects without sending the message.  [[#62]]

    The limit counts connections that are being established, connections that
    are currently sending, and idle connections retained for reuse, and it
    applies whether or not `SmtpConfig.pool` is enabled.  Note that a
    `sendMany()` call holds its connection for the whole iteration, so running
    more concurrent `sendMany()` calls than `poolSize` makes the extra ones
    wait.

 -  Fixed overlapping returns retaining more idle connections than
    `SmtpConfig.poolSize`.  Returning a connection checked the pool size before
    awaiting `RSET`, so several returns could pass the check together and then
    all be retained.  [[#62]]

 -  Abandoning a `sendMany()` iteration early, such as with `break`, now
    returns its connection instead of leaving it open until the transport is
    disposed.

 -  `new SmtpTransport()` now throws a `RangeError` when `poolSize` is neither a
    positive integer nor `Infinity`, rather than accepting a value that no
    connection could satisfy.  Pass `Infinity` to opt out of the limit and keep
    the unbounded behaviour of earlier versions.

[#62]: https://github.com/dahlia/upyo/issues/62


Version 0.5.4
-------------

Released on September 7, 2026.

### @upyo/core

 -  `createMessage()` now rejects a carriage return or line feed in an address,
    an attachment's content type, or an attachment's content ID with a
    `TypeError`.  A transport that composes the message itself writes these
    values into header fields as given, so either character ended the field and
    let the rest of the value appear as further header fields.  [[#60]]

    Address strings were already rejected by `parseAddress()`, but the object
    form passed through unchecked, so
    `createMessage({ to: { address: "victim@example.net\r\nBcc: …" } })`
    forged a `Bcc` field.  Attachments were unchecked in either form, and an
    uploaded file's declared content type is routinely chosen by whoever
    uploaded it.

    Values that arrive through a `Message` object built by hand rather than
    through `createMessage()` are still passed on as given.

[#60]: https://github.com/dahlia/upyo/issues/60

### @upyo/smtp

 -  Stopped emitting duplicate header fields when a custom header collides with
    one the transport composes itself.  RFC 5322 §3.6 permits at most one
    `Date`, `From`, `Message-ID`, `Subject`, and similar field per message, but
    every custom header used to be appended after the composed ones.  A
    duplicate `Content-Type` was the worst case: it preceded the real one, so
    receivers that take the first occurrence misread the body and ignored the
    MIME boundaries.  [[#57]]

     -  `Date` and `Message-ID` have no counterpart on `Message`, so a custom
        header now replaces the generated default instead of adding a second
        field.  Applications can finally choose an outgoing message identifier
        for reply correlation.  Header names are matched case-insensitively,
        and the values are written verbatim rather than RFC 2047 encoded.
        A value containing a carriage return or line feed is rejected with a
        `TypeError`, so it cannot inject additional header fields.  Messages
        that supply neither header keep the previous generated values.

     -  Custom `From`, `To`, `Cc`, `Bcc`, `Reply-To`, `Subject`,
        `MIME-Version`, `Content-Type`, and `Content-Transfer-Encoding` headers
        are now ignored, because the corresponding `Message` fields and the
        MIME structure are authoritative.  Set the structured fields instead.
        A custom `Bcc` header used to disclose blind recipients to everyone who
        received the message.

     -  Custom `X-Priority` and `X-MSMail-Priority` headers are still sent for
        messages of normal priority, but no longer duplicate the headers
        derived from a `high` or `low` `priority`.

[#57]: https://github.com/dahlia/upyo/issues/57


Version 0.5.3
-------------

Released on August 27, 2026.

### @upyo/smtp

 -  Accepted `251` responses to `RCPT TO`, allowing delivery to continue when
    an SMTP server accepts responsibility for forwarding a recipient.  [[#37]]

 -  Continued SMTP delivery when at least one envelope recipient is accepted.
    Successful `SmtpReceipt` values now list rejected recipients with their
    reply codes, response text, and retryability so callers can detect partial
    delivery and retry only temporarily rejected recipients.  [[#38]]

 -  Kept multibyte UTF-8 characters within a single RFC 2047 encoded word when
    splitting long non-ASCII header values.  [[#39]]

 -  Folded long address, subject, custom, and attachment header fields to keep
    their physical lines within the RFC 5322 hard limit of 998 characters.
    Long attachment filenames now use RFC 2231 continuations, while a custom
    header token that cannot be folded produces a failed receipt instead of an
    invalid message.  [[#40]]

 -  Retried the SMTP greeting with `HELO` when a legacy server rejects `EHLO`
    as an unrecognized or unimplemented command.  [[#41]]

[#37]: https://github.com/dahlia/upyo/issues/37
[#38]: https://github.com/dahlia/upyo/issues/38
[#39]: https://github.com/dahlia/upyo/issues/39
[#40]: https://github.com/dahlia/upyo/issues/40
[#41]: https://github.com/dahlia/upyo/issues/41


Version 0.5.2
-------------

Released on August 27, 2026.

### @upyo/smtp

 -  Prevented SMTP authentication from sending passwords or OAuth 2.0 access
    tokens over cleartext connections to non-loopback hosts.  Configurations
    using `secure: false` now require a successful STARTTLS upgrade before
    authenticating; otherwise delivery returns a failed `Receipt` without
    transmitting credentials.  Cleartext authentication to loopback hosts
    remains available for local development.  [[#36]]

[#36]: https://github.com/dahlia/upyo/issues/36


Version 0.5.1
-------------

Released on July 16, 2026.

### @upyo/plunk

 -  Updated the default Plunk API base URL to
    `https://next-api.useplunk.com` and adapted request and response handling
    to the new API contract.  [[#35]]

[#35]: https://github.com/dahlia/upyo/issues/35


Version 0.5.0
-------------

Released on July 1, 2026.

### @upyo/core

 -  Added structured delivery error metadata to failed `Receipt` values.
    Failed receipts still include `errorMessages` for existing code, and may
    now also include `errors`, `retryable`, `provider`, `attempts`, and
    `timestamp` fields for programmatic error handling.  Structured errors may
    also include provider-specific `providerDetails` when a transport exposes
    them.  [[#25], [#27]]

    `Receipt`, `ReceiptError`, and `Transport` are now generic over the
    transport provider id, and `Transport` implementations expose a stable
    `id` field so `provider` metadata can be type-checked.

     -  Added the `ReceiptError` interface.
     -  Added the `ReceiptErrorCategory` type.
     -  Added the `ReceiptErrorClassification` interface.
     -  Added the `CreateReceiptErrorOptions` interface.
     -  Added the `CreateFailedReceiptOptions` interface.
     -  Added the `classifyHttpStatus()` function.
     -  Added the `classifyReceiptError()` function.
     -  Added the `createReceiptError()` function.
     -  Added the `createFailedReceipt()` function.
     -  Added the `parseRetryAfter()` function.

[#25]: https://github.com/dahlia/upyo/issues/25
[#27]: https://github.com/dahlia/upyo/pull/27

### @upyo/jmap

 -  Updated `JmapTransport` to return structured failure receipts with
    provider ids, retryability, HTTP status codes, retry delay metadata from
    `Retry-After`, and attempt counts where available.  [[#25], [#27]]

### @upyo/lettermint

 -  Added [Lettermint] transport.  [[#22], [#23]]

     -  Added `LettermintTransport` class.
     -  Added `LettermintConfig` interface.
     -  Added `ResolvedLettermintConfig` type.
     -  Added `LettermintSettings` interface.
     -  Added `LettermintApiError` class.
     -  Added `LettermintBatchResponse` type.
     -  Added `LettermintError` interface.
     -  Added `LettermintResponse` interface.
     -  Added `LettermintStatus` type.
     -  Supports single sends, batch sends, idempotency keys, attachments,
        inline images, routes, tags, metadata, and tracking settings.

[Lettermint]: https://lettermint.co/
[#22]: https://github.com/dahlia/upyo/issues/22
[#23]: https://github.com/dahlia/upyo/pull/23

### @upyo/mailgun

 -  Updated `MailgunTransport` to return structured failure receipts with
    provider ids, retryability, HTTP status codes, retry delay metadata from
    `Retry-After`, and attempt counts where available.  [[#25], [#27]]

### @upyo/plunk

 -  Updated `PlunkTransport` to return structured failure receipts with
    provider ids, retryability, HTTP status codes, retry delay metadata from
    `Retry-After`, and attempt counts where available.  [[#25], [#27]]

### @upyo/resend

 -  Updated `ResendTransport` to return structured failure receipts with
    provider ids, retryability, HTTP status codes, retry delay metadata from
    `Retry-After`, and attempt counts where available.  Batch item failures
    now include structured error metadata as well.  [[#25], [#27]]

### @upyo/sendgrid

 -  Updated `SendGridTransport` to return structured failure receipts with
    provider ids, retryability, HTTP status codes, retry delay metadata from
    `Retry-After`, and attempt counts where available.  [[#25], [#27]]

### @upyo/ses

 -  Updated `SesTransport` to return structured failure receipts with provider
    ids, retryability, HTTP status codes, retry delay metadata from
    `Retry-After`, and attempt counts where available.  [[#25], [#27]]

### @upyo/smtp

 -  Updated `SmtpTransport` to return structured failure receipts with
    provider ids, retryability, attempt counts, and classified network,
    timeout, authentication, and rejection errors.  [[#25], [#27]]

 -  Added OAuth 2.0 authentication support to the SMTP transport, using the
    SASL *XOAUTH2* and *OAUTHBEARER* ([RFC 7628]) mechanisms.  This enables
    authentication with providers such as Gmail and Outlook that require OAuth
    2.0 instead of passwords.  [[#19], [#24]]

     -  `SmtpAuth` is now a discriminated union of `SmtpUserPassAuth`
        (username/password, as before) and the OAuth 2.0 variants.  Existing
        `{ user, pass }` configurations continue to work unchanged.
     -  Added `SmtpOAuth2Auth`, `SmtpOAuth2TokenAuth`, and
        `SmtpOAuth2RefreshAuth` interfaces, and the `SmtpUserPassAuth`
        interface.
     -  Added the `OAuth2TokenProvider` type.  The `accessToken` field accepts
        either a static token string or a callback returning a fresh token,
        which can integrate an external OAuth client (e.g.,
        `google-auth-library` or `msal-node`) for transparent refresh.
     -  Added the built-in `refresh_token` grant flow
        (`SmtpOAuth2RefreshAuth`): provide `clientId`, `refreshToken`, and
        `tokenEndpoint`, and the transport exchanges them for an access token,
        caching it across pooled connections until shortly before it expires.
     -  Added the `SmtpAuthError` class, thrown on OAuth token acquisition and
        SASL authentication failures.

 -  Changed `SmtpTransport.send()` and `SmtpTransport.sendMany()` to report
    connection and authentication setup failures as a failed `Receipt` instead
    of throwing.  Previously, a failure to connect or authenticate (e.g., an
    invalid host, a refused connection, or rejected credentials) rejected the
    returned promise, which was inconsistent with message-level failures (such
    as a rejected recipient) that were already reported as a failed `Receipt`.
    Now all delivery failures—including setup failures—are reported uniformly
    as a failed `Receipt`.  Cancellation via `AbortSignal` continues to reject.
    [[#19], [#24]]

[RFC 7628]: https://www.rfc-editor.org/rfc/rfc7628
[#19]: https://github.com/dahlia/upyo/issues/19
[#24]: https://github.com/dahlia/upyo/pull/24

### @upyo/pool

 -  Updated `PoolTransport` to preserve child transport provider ids in
    aggregated structured errors.  The pool itself reports failed aggregate
    receipts with the `"pool"` provider id, while child errors keep the
    underlying transport ids as a type-safe union.  [[#25], [#27]]

### @upyo/retry

 -  Added retry transport.  `RetryTransport` wraps any existing transport and
    retries transient failed receipts or thrown transient errors using
    configurable exponential backoff, jitter, `Retry-After` metadata, and
    `sendMany()` launch throttling.  Use it when one provider should absorb
    temporary rate limits, server errors, and network failures before handing
    a failure back to application code.  [[#26], [#28]]

[#26]: https://github.com/dahlia/upyo/issues/26
[#28]: https://github.com/dahlia/upyo/pull/28

### @upyo/opentelemetry

 -  Changed the built-in error category labels from underscore spelling to
    hyphen spelling: `rate-limit`, `service-unavailable`, and `server-error`.
    OpenTelemetry metrics now prefer structured receipt categories when a
    wrapped transport returns them, then fall back to the configured error
    classifier.  [[#25], [#27]]


Version 0.4.1
-------------

Released on July 16, 2026.

### @upyo/plunk

 -  Updated the default Plunk API base URL to
    `https://next-api.useplunk.com` and adapted request and response handling
    to the new API contract.  [[#35]]


Version 0.4.0
-------------

Released on December 25, 2025. Happy Holidays!

### @upyo/core

 -  Added `idempotencyKey` property to `Message` interface.  [[#16]]

    This allows users to provide their own idempotency key for request
    deduplication when retrying failed send operations.  By including the key
    in the message itself, retries become simpler—just resend the same message
    object.  If not provided, transports may generate their own key internally
    (behavior varies by transport implementation).

[#16]: https://github.com/dahlia/upyo/issues/16

### @upyo/smtp

 -  Added DKIM (DomainKeys Identified Mail) signing support.  [[#18]]

    Outgoing emails can now be signed with DKIM for improved deliverability
    and authentication.  The implementation uses the standard Web Crypto API
    for cross-runtime compatibility (Node.js, Deno, Bun, edge functions).

     -  Added `DkimConfig` interface for configuring DKIM signing.
     -  Added `DkimSignature` interface for individual signature settings.
     -  Added `DkimAlgorithm` type supporting `rsa-sha256` (RFC 6376) and
        `ed25519-sha256` (RFC 8463).
     -  Added `DkimCanonicalization` type for header/body canonicalization.
     -  Added `DkimSigningFailureAction` type (`throw` or `send-unsigned`).
     -  Supports multiple DKIM signatures per message.
     -  Configurable failure handling: throw error or send unsigned.
     -  Accepts both PEM strings and `CryptoKey` objects for private keys.

[#18]: https://github.com/dahlia/upyo/issues/18

### @upyo/jmap

 -  Added JMAP transport for sending emails via JMAP protocol.  [[#10]]

    JMAP (JSON Meta Application Protocol) is a modern, efficient protocol for
    email access and submission, defined in RFC 8620 (core) and RFC 8621 (mail).
    This transport provides:

     -  Automatic session discovery and caching
     -  Automatic identity resolution from sender email
     -  Bearer token authentication
     -  Exponential backoff retry with configurable attempts
     -  Request timeout and `AbortSignal` support
     -  Text and HTML message content (`multipart/alternative`)
     -  Priority headers (`X-Priority`, `Importance`)
     -  Custom headers
     -  File attachments via blob upload
     -  Inline attachments (`multipart/related`)

[#10]: https://github.com/dahlia/upyo/issues/10

### @upyo/resend

 -  Added support for user-provided idempotency keys via
    `Message.idempotencyKey`. [[#16]]

    Each message can now include an `idempotencyKey` to ensure it is not sent
    multiple times during retries.  For batch operations via `sendMany()`, the
    first message's key is used for the entire batch request.  If not provided,
    a unique key is automatically generated for each request.


Version 0.3.4
-------------

Released on December 18, 2025.

### @upyo/resend

 -  Fixed idempotency key not being sent as an HTTP request header.  [[#16]]

    The Resend transport was incorrectly adding the `Idempotency-Key` to the
    email's custom headers inside the JSON payload, but the Resend API expects
    it as an HTTP request header.  This fix moves the idempotency key to the
    proper location.


Version 0.3.3
-------------

Released on December 13, 2025.

### @upyo/core

 -  Fixed a potential SMTP command injection vulnerability.

    Email addresses are now validated to prevent newline characters (`\r` or
    `\n`), which could be used to inject malicious SMTP commands.


Version 0.3.2
-------------

Released on December 12, 2025.

### @upyo/ses

 -  Fixed headers serialization issue on edge runtimes.  [[#15]]

    The SES transport now converts the `Headers` object to a plain object
    before passing to `fetch()`, which resolves “Missing Authentication
    Token” errors on edge runtimes like Bunny CDN Edge that don't properly
    serialize `Headers` objects.

[#15]: https://github.com/dahlia/upyo/issues/15


Version 0.3.1
-------------

Released on November 3, 2025.

### @upyo/smtp

 -  Added STARTTLS support for secure connection upgrade.  The SMTP transport
    now automatically detects and uses STARTTLS when connecting to servers
    that advertise this capability (such as Protonmail, Office 365, and others).
    This allows using port 587 with `secure: false` for automatic encryption
    upgrade.  [[#14]]

[#14]: https://github.com/dahlia/upyo/issues/14


Version 0.3.0
-------------

Released on September 16, 2025.

### @upyo/pool

 -  Added pool transport for combining multiple email providers with load
    balancing and failover strategies.  [[#8]]

     -  Added `PoolTransport` class with `AsyncDisposable` support.
     -  Added `PoolConfig` interface.
     -  Added `ResolvedPoolConfig` type.
     -  Added `TransportEntry` interface.
     -  Added `ResolvedTransportEntry` type.
     -  Added `PoolStrategy` type for built-in strategies.
     -  Added `Strategy` interface for custom routing logic.
     -  Added `TransportSelection` interface.
     -  Added `RoundRobinStrategy` class for equal distribution.
     -  Added `WeightedStrategy` class for proportional distribution.
     -  Added `PriorityStrategy` class for failover-based routing.
     -  Added `SelectorBasedStrategy` class for content-based routing.
     -  Support for round-robin, weighted, priority, and selector-based
        strategies.
     -  Automatic failover and retry logic with configurable limits.
     -  Comprehensive error aggregation across multiple providers.

[#8]: https://github.com/dahlia/upyo/issues/8

### @upyo/plunk

 -  Added [Plunk] transport.  [[#11]]

     -  Added `PlunkTransport` class.
     -  Added `PlunkConfig` interface.
     -  Added `ResolvedPlunkConfig` interface.
     -  Added `PlunkError` interface.
     -  Added `PlunkResponse` interface.
     -  Support for both cloud-hosted and self-hosted Plunk instances.

[Plunk]: https://www.useplunk.com/
[#11]: https://github.com/dahlia/upyo/issues/11

### @upyo/resend

 -  Added [Resend] transport.  [[#9]]

     -  Added `ResendTransport` class.
     -  Added `ResendConfig` interface.
     -  Added `ResolvedResendConfig` interface.
     -  Added `ResendApiError` interface.
     -  Added `ResendBatchResponse` interface.
     -  Added `ResendError` interface.
     -  Added `ResendResponse` interface.

[Resend]: https://resend.com/
[#9]: https://github.com/dahlia/upyo/issues/9


Version 0.2.4
-------------

Released on December 13, 2025.

### @upyo/core

 -  Fixed a potential SMTP command injection vulnerability.

    Email addresses are now validated to prevent newline characters (`\r` or
    `\n`), which could be used to inject malicious SMTP commands.


Version 0.2.3
-------------

Released on December 12, 2025.

### @upyo/ses

 -  Fixed headers serialization issue on edge runtimes.  [[#15]]

    The SES transport now converts the `Headers` object to a plain object
    before passing to `fetch()`, which resolves “Missing Authentication
    Token” errors on edge runtimes like Bunny CDN Edge that don't properly
    serialize `Headers` objects.


Version 0.2.2
-------------

Released on November 3, 2025.

### @upyo/smtp

 -  Added STARTTLS support for secure connection upgrade.  The SMTP transport
    now automatically detects and uses STARTTLS when connecting to servers
    that advertise this capability (such as Protonmail, Office 365, and others).
    This allows using port 587 with `secure: false` for automatic encryption
    upgrade.  [[#14]]


Version 0.2.1
-------------

Released on August 4, 2025.

### @upyo/smtp

 -  Fixed “Maximum call stack size exceeded” error when sending large
    attachments.  [[#6]]

    The SMTP transport now uses `Buffer.from().toString('base64')` instead of
    the legacy `btoa()` function for base64 encoding, which resolves stack
    overflow issues with large attachments (e.g., 500KB+ files).

 -  Fixed UTF-8 encoding issue where email addresses were incorrectly encoded
    in SMTP headers.  [[#7]]

    Only display names are now encoded using RFC 2047 encoding, while email
    addresses remain unencoded. For example, `German ÄÖÜ <info@example.com>`
    now correctly becomes `=?UTF-8?B?...?= <info@example.com>` instead of
    encoding the entire string including the email address.

[#6]: https://github.com/dahlia/upyo/issues/6
[#7]: https://github.com/dahlia/upyo/issues/7


Version 0.2.0
-------------

Released on July 17, 2025.

### @upyo/core

 -  Improved type safety by making array fields readonly.

     -  Changed the type of `Message.recipients` property from `Address[]` to
        `readonly Address[]`.
     -  Changed the type of `Message.ccRecipients` property from `Address[]` to
        `readonly Address[]`.
     -  Changed the type of `Message.bccRecipients` property from `Address[]` to
        `readonly Address[]`.
     -  Changed the type of `Message.replyRecipients` property from `Address[]`
        to `readonly Address[]`.
     -  Changed the type of `Message.attachments` property from `Attachment[]`
        to `readonly Attachment[]`.
     -  Changed the type of `Message.tags` property from `string[]` to
        `readonly string[]`.

 -  Enhanced email address type safety with template literal types.

     -  Added `EmailAddress` type.
     -  Changed `Address.address` property type from `string` to `EmailAddress`.
     -  Added `isEmailAddress()` type guard function for runtime email
        validation.

### @upyo/ses

 -  Added Amazon SES transport.  [[#3]]

     -  Added `SesTransport` class.
     -  Added `SesConfig` interface.
     -  Added `SesAuthentication` interface.

[#3]: https://github.com/dahlia/upyo/issues/3

### @upyo/opentelemetry

 -  Added OpenTelemetry observability support.  [[#5]]

     -  Added `OpenTelemetryTransport` class.
     -  Added `OpenTelemetryConfig` interface.
     -  Added `ObservabilityConfig` interface.
     -  Added `MetricsConfig` interface.
     -  Added `TracingConfig` interface.
     -  Added `AttributeExtractor` type.
     -  Added `ErrorClassifier` type.
     -  Added `createErrorClassifier()` function.
     -  Added `defaultErrorClassifier()` function.
     -  Added `AutoConfig` interface.
     -  Added `createOpenTelemetryTransport()` function.
     -  Added `CreateOpenTelemetryTransportConfig` interface.
     -  Added `createEmailAttributeExtractor()` function.

[#5]: https://github.com/dahlia/upyo/issues/5


Version 0.1.2
-------------

Released on Nowember 3, 2025.

### @upyo/smtp

 -  Added STARTTLS support for secure connection upgrade.  The SMTP transport
    now automatically detects and uses STARTTLS when connecting to servers
    that advertise this capability (such as Protonmail, Office 365, and others).
    This allows using port 587 with `secure: false` for automatic encryption
    upgrade.  [[#14]]


Version 0.1.1
-------------

Released on July 14, 2025.

### @upyo/smtp

 -  Fixed CJK character encoding corruption in SMTP transport HTML emails.
    Korean, Japanese, and Chinese characters are now properly encoded using
    UTF-8 quoted-printable encoding.  [[#4]]

[#4]: https://github.com/dahlia/upyo/issues/4


Version 0.1.0
-------------

Initial release.  Released on July 13, 2025.

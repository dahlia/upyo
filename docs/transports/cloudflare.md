---
description: >-
  Cloudflare Email Service transport guide covering the REST API and the
  Workers send_email binding, attachments, custom headers, retries, and error
  handling.
---

Cloudflare
==========

*This transport is introduced in Upyo 0.7.0.*

[Cloudflare Email Service] lets you send transactional email from domains you
manage on Cloudflare.  The *@upyo/cloudflare* package provides two transports
for it:

 -  `CloudflareTransport` talks to its [REST API] with an API token, so it
    works from any runtime, including Node.js, Deno, Bun, and edge functions.
 -  `CloudflareWorkerTransport` sends through a `send_email` binding from code
    running on Cloudflare Workers, with no API token.  See
    [Cloudflare Workers](#cloudflare-workers) below.

Both take the same messages and apply the same checks.  The sections up to
[Cloudflare Workers](#cloudflare-workers) describe the REST transport.

[Cloudflare Email Service]: https://developers.cloudflare.com/email-service/
[REST API]: https://developers.cloudflare.com/api/resources/email_sending/


Installation
------------

::: code-group

~~~~ sh [npm]
npm add @upyo/cloudflare
~~~~

~~~~ sh [pnpm]
pnpm add @upyo/cloudflare
~~~~

~~~~ sh [Yarn]
yarn add @upyo/cloudflare
~~~~

~~~~ sh [Deno]
deno add jsr:@upyo/cloudflare
~~~~

~~~~ sh [Bun]
bun add @upyo/cloudflare
~~~~

:::


Getting started
---------------

You need three things before sending:

1.  A sending domain onboarded to Cloudflare Email Sending.  The `from`
    address of every message must belong to it.
2.  Your Cloudflare account ID.
3.  An [API token] with permission to send email.

~~~~ typescript twoslash
import { createMessage } from "@upyo/core";
import { CloudflareTransport } from "@upyo/cloudflare";

const transport = new CloudflareTransport({
  accountId: "your-account-id",
  apiToken: "your-api-token",
});

const receipt = await transport.send(
  createMessage({
    from: "welcome@yourdomain.com",
    to: "user@example.com",
    subject: "Welcome!",
    content: { text: "Thanks for signing up.", html: "<p>Thanks for signing up.</p>" },
  }),
);

if (receipt.successful) {
  console.log("Message sent with ID:", receipt.messageId);
} else {
  console.error("Send failed:", receipt.errorMessages.join(", "));
}
~~~~

Keep the account ID and token in environment variables or a secret store
rather than in source code.

[API token]: https://developers.cloudflare.com/fundamentals/api/get-started/create-token/


Configuration
-------------

`accountId`
:   Your Cloudflare account ID.

`apiToken`
:   A Cloudflare API token with email sending permission.

`baseUrl`
:   API base URL.  Defaults to `https://api.cloudflare.com/client/v4`.

`timeout`
:   Request timeout in milliseconds.  Defaults to `30000`.

`retries`
:   How many times to retry a request that Cloudflare answered with `429` or
    a `5xx` status, as Cloudflare recommends.  Defaults to `3`.
    The transport waits 1 second before the first retry, doubling after each
    attempt, at most 10 seconds; a `Retry-After` header is honored instead, up
    to 60 seconds.  Network failures and timeouts are not retried, because the
    message may already have been accepted and the API has no idempotency key.
    A `5xx` answer carries a smaller version of the same risk; set `retries` to
    `0` if a duplicate message is worse for you than a failed send.

`headers`
:   Additional HTTP headers to send with every request.


Supported features
------------------

 -  HTML and plain text content, CC, BCC, and a reply-to address, with
    display names on every address
 -  Attachments and inline images (referenced with `cid:` URIs).  An inline
    attachment needs a content ID; one without is sent as a regular
    attachment, since Cloudflare rejects an inline one without it.
 -  Custom headers, including `List-Unsubscribe` and the reply threading
    fields `inReplyTo` and `references`
 -  Priority, sent as an `X-Priority` header unless the message sets its own
 -  Calendar invitations, attached as an *invite.ics* file

Some things are not available:

 -  Tags are ignored, since the [API][REST API reference] has no equivalent.
 -  Only the first reply-to address is used, since the API takes a single
    one.
 -  The `messageId` and `date` fields of a message are ignored, because
    Cloudflare generates the `Message-ID` and `Date` headers itself
    ([headers]).
 -  There is no batch endpoint, so `sendMany()` sends messages one at a time.

[REST API reference]: https://developers.cloudflare.com/api/resources/email_sending/methods/send/
[headers]: https://developers.cloudflare.com/email-service/reference/headers/


Checks before sending
---------------------

Both transports reject a few messages before sending them, because Cloudflare
would reject them too, but with an error that does not say why: in our tests
the REST API answered every one of these with the same generic error code.
The message fails with a validation receipt that is not retryable, whose error
says what is wrong:

`cloudflare.header_not_allowed`
:   A custom header is one that Cloudflare generates: `Date`, `Message-ID`,
    `MIME-Version`, `Content-Type`, `Content-Transfer-Encoding`,
    `DKIM-Signature`, `Return-Path`, `Received`, `Feedback-ID`, `ARC-*`,
    `TLS-Required`, `TLS-Report-Domain`, `TLS-Report-Submitter`,
    `CFBL-Address`, or `CFBL-Feedback-ID` ([headers]).

`cloudflare.header_use_api_field`
:   A custom header belongs in a message field: `From`, `To`, `Cc`, `Bcc`,
    `Subject`, or `Reply-To` ([headers]).  The error names the field to use.

`cloudflare.too_many_recipients`
:   The message has more than 50 recipients across `to`, `cc`, and `bcc`
    ([limits]).

Header names are compared without regard to case.

Everything else is left to Cloudflare, which may change its rules, and comes
back as a failed receipt when Cloudflare rejects it: which other headers are
on its [allowlist][headers] (any header starting with `X-` is allowed), its
limits on header names, values, and total size, the subject length, the
number of attachments, and the size of a message ([limits]).  Line breaks in
a display name, a subject, or a filename cannot add headers either: Cloudflare
rejects them in display names and encodes them in subjects and filenames.

[limits]: https://developers.cloudflare.com/email-service/platform/limits/


Delivery status
---------------

A successful receipt means Cloudflare accepted the message, and its
`messageId` is the identifier Cloudflare returned.  Cloudflare often queues
a message instead of delivering it at once, so treat `successful` as “accepted
for delivery”, not “delivered”.

A message that reaches at least one recipient is a success, even if
Cloudflare reports that others bounced or are on the suppression list.
A message that reaches none of them, because every recipient bounced or is on
the suppression list, is a failure.


Error handling
--------------

A failed send returns a receipt with `successful: false` instead of throwing.
Its `errors` carry the HTTP status code, a category, and whether retrying may
help.  Cancelling through the `AbortSignal` passed to `send()` throws as usual.

Each error has a `code`:

`cloudflare.<number>`
:   Cloudflare's own numeric error code, such as `cloudflare.1000`.  The
    errors from the response are in `providerDetails`.  If the response has
    no error code, the code is `cloudflare.<HTTP status>`.

`cloudflare.header_not_allowed`, `cloudflare.header_use_api_field`,
`cloudflare.too_many_recipients`
:   The message failed a [check before sending](#checks-before-sending).
    Nothing was sent.

`cloudflare.recipients_rejected`
:   Cloudflare accepted the request, but every recipient bounced or is on the
    suppression list.

`cloudflare.missing_message_id`
:   Cloudflare accepted the request but did not return a message ID.  The
    message may have been sent, so this failure is not retryable.


Cloudflare Workers
------------------

Code running on Cloudflare Workers can send through a
[`send_email` binding][send_email] instead of the REST API.  The binding
belongs to the account the Worker runs in and carries the permission, so
there is no account ID or API token to configure.  The `from` address must
still belong to a domain onboarded to Cloudflare Email Sending in that
account.  Declare the binding in *wrangler.jsonc*:

~~~~ jsonc
{
  "send_email": [{ "name": "EMAIL" }]
}
~~~~

The binding can also be [restricted][send bindings] to certain senders and
recipients.

Then pass `env.EMAIL` to `CloudflareWorkerTransport`.  The binding's type
that `wrangler types` generates fits its `binding` option:

~~~~ typescript twoslash
import type { CloudflareEmailBinding } from "@upyo/cloudflare";
declare const env: { EMAIL: CloudflareEmailBinding };
// ---cut-before---
import { createMessage } from "@upyo/core";
import { CloudflareWorkerTransport } from "@upyo/cloudflare";

const transport = new CloudflareWorkerTransport({ binding: env.EMAIL });

const receipt = await transport.send(
  createMessage({
    from: "welcome@yourdomain.com",
    to: "user@example.com",
    subject: "Welcome!",
    content: { text: "Thanks for signing up." },
  }),
);
~~~~

Its options are:

`binding`
:   The `send_email` binding, such as `env.EMAIL`.

`retries`
:   How many times to retry when the binding reports a rate limit
    (`E_RATE_LIMIT_EXCEEDED`) or a server error (`E_INTERNAL_SERVER_ERROR`).
    Defaults to `3`.  The binding gives no retry delay, so the transport waits
    1 second before the first retry, doubling after each attempt, at most 10
    seconds.  As with the REST transport, a server error may hide a message
    that was already accepted; set `retries` to `0` if a duplicate message is
    worse for you than a failed send.

It behaves like the REST transport, including the
[checks before sending](#checks-before-sending), with these differences:

 -  A failure's `code` is the binding's own, such as
    `cloudflare.E_RATE_LIMIT_EXCEEDED` or `cloudflare.E_VALIDATION_ERROR`,
    and its `providerDetails` is `{ code, message }`.  The receipt says
    whether retrying may help; rate limits, internal errors, and delivery
    failures are retryable, though the transport itself retries only the
    first two.
 -  Cancellation is best effort: the binding takes no `AbortSignal`, so
    aborting while it sends stops `send()` from waiting, but the message may
    still go out.  Aborting while the transport waits to retry stops it at
    once.

[send_email]: https://developers.cloudflare.com/email-service/api/send-emails/workers-api/
[send bindings]: https://developers.cloudflare.com/email-service/configuration/send-bindings/

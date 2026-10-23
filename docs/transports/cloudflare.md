---
description: >-
  Cloudflare Email Service transport guide covering account setup, API token
  configuration, attachments, custom headers, retries, and error handling.
---

Cloudflare
==========

*This transport is introduced in Upyo 0.7.0.*

[Cloudflare Email Service] lets you send transactional email from domains you
manage on Cloudflare.  Upyo's Cloudflare transport, provided by the
*@upyo/cloudflare* package, talks to its [REST API], so it works from any
runtime, including Node.js, Deno, Bun, and edge functions outside of
Cloudflare Workers.

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
    A `Retry-After` header is honored.  Network failures and timeouts are not
    retried, because the message may already have been accepted and the API
    has no idempotency key.  A `5xx` answer carries a smaller version of the
    same risk; set `retries` to `0` if a duplicate message is worse for you
    than a failed send.

`headers`
:   Additional HTTP headers to send with every request.


Supported features
------------------

 -  HTML and plain text content, CC, BCC, and a reply-to address, with
    display names on every address
 -  Attachments and inline images (referenced with `cid:` URIs)
 -  Custom headers, including `List-Unsubscribe` and the reply threading
    fields `inReplyTo` and `references`
 -  Priority, sent as an `X-Priority` header
 -  Calendar invitations, attached as an *invite.ics* file

Some things are not available:

 -  Tags are ignored, since the API has no equivalent.
 -  Only the first reply-to address is used.
 -  The `messageId` and `date` fields of a message are ignored, because
    Cloudflare generates the `Message-ID` and `Date` headers itself.
 -  Cloudflare rejects a whole message that carries a header it controls, a
    header that belongs in a message field (such as `Subject` or `Reply-To`),
    or a header outside its [allowlist][headers] that does not start with
    `X-`.  The transport rejects the first two kinds before sending, with a
    `CloudflareValidationError` that names the header.  The allowlist and
    Cloudflare's limits on header names, values, and total size are left to
    Cloudflare, which may change them; a message that breaks one comes back as
    a failed receipt.
 -  A message can have at most 50 recipients across `to`, `cc`, and `bcc`.
    The transport rejects more before sending, with a
    `CloudflareValidationError`.
 -  There is no batch endpoint, so `sendMany()` sends messages one at a time.

Cloudflare also limits the size of a message, attachments included; see its
[limits] page for the current numbers.  The transport leaves that check to
Cloudflare.

[headers]: https://developers.cloudflare.com/email-service/reference/headers/
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

`cloudflare.header_not_allowed`, `cloudflare.header_use_api_field`
:   A custom header is one that Cloudflare generates, or one that belongs in
    a message field.  Nothing was sent.

`cloudflare.too_many_recipients`
:   The message has more than 50 recipients.  Nothing was sent.

`cloudflare.recipients_rejected`
:   Cloudflare accepted the request, but every recipient bounced or is on the
    suppression list.

`cloudflare.missing_message_id`
:   Cloudflare accepted the request but did not return a message ID.  The
    message may have been sent, so this failure is not retryable.

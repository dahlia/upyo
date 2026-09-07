---
links:
  '#58': https://github.com/dahlia/upyo/issues/58
  '#61': https://github.com/dahlia/upyo/pull/61
---
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

---
links:
  '#58': https://github.com/dahlia/upyo/issues/58
  '#61': https://github.com/dahlia/upyo/pull/61
---
 -  Added support for the `inReplyTo` and `references` fields of `Message`,
    which are sent as custom headers.  A field left unset defers to an
    `In-Reply-To` or `References` header supplied through `headers`, and an
    empty array suppresses it.
    `messageId` and `date` are not sent, because the provider does not document
    whether a supplied value survives.  [[#58], [#61]]

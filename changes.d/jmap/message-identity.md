---
links:
  '#58': https://github.com/dahlia/upyo/issues/58
  '#61': https://github.com/dahlia/upyo/pull/61
---
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

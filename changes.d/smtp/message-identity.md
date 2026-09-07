---
links:
  '#58': https://github.com/dahlia/upyo/issues/58
  '#61': https://github.com/dahlia/upyo/pull/61
---
 -  Added support for the `messageId`, `date`, `inReplyTo`, and `references`
    fields of `Message`.  Each takes precedence over a custom header of the same
    name, which still applies when the field is left unset.  [[#58], [#61]]

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

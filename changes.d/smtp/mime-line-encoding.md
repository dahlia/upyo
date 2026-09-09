---
links:
  '#68': https://github.com/dahlia/upyo/issues/68
  '#74': https://github.com/dahlia/upyo/pull/74
---
 -  Fixed quoted-printable encoding of CRLF, isolated line endings, trailing
    spaces, and long lines so messages preserve their text and respect MIME
    line limits.  Inline Content-ID headers now reject values that cannot fit
    the RFC 5322 line limit.  Directly constructed messages now reject address
    line breaks and invalid custom header names.  [[#68], [#74]]

---
links:
  '#46': https://github.com/dahlia/upyo/issues/46
  '#51': https://github.com/dahlia/upyo/pull/51
---
 -  Added structured enhanced status codes to SMTP delivery failures.  Valid
    RFC 2034 reply prefixes expose their class, subject, and detail while
    preserving the server's original text; address, content, and network
    statuses also receive more specific error categories.  [[#46], [#51]]

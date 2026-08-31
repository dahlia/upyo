---
links:
  '#52': https://github.com/dahlia/upyo/issues/52
  '#54': https://github.com/dahlia/upyo/pull/54
---
 -  Added SMTP envelope overrides for using different `MAIL FROM` and `RCPT TO`
    addresses without changing the visible message headers.  Overrides support
    null reverse-paths and per-message resolvers for bulk VERP delivery.
    [[#52], [#54]]

---
links:
  '#67': https://github.com/dahlia/upyo/issues/67
  '#73': https://github.com/dahlia/upyo/pull/73
---
 -  Added `SmtpTransport.verify()` to check a fresh connection, TLS policy, and
    configured authentication without sending mail.  Verification shares the
    connection limit, closes its connection afterward, and rejects on failure.
    `SmtpResponseError` and `SmtpAuthResponseError` are now exported for
    inspecting server replies.  [[#67], [#73]]
 -  Fixed cancellation during SMTP connection setup and while waiting for a
    custom OAuth2 token provider, so cancelled operations release their
    connections promptly.

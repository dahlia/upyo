---
links:
  '#67': https://github.com/dahlia/upyo/issues/67
  '#73': https://github.com/dahlia/upyo/pull/73
---
 -  Added `JmapTransport.verify()` to check live session, account, drafts
    mailbox, and identity settings without sending mail or changing the session
    cache. Verification rejects on failure and bounds each discovery operation,
    including response bodies and retries, by the configured timeout.
    [[#67], [#73]]
 -  Fixed cancellation during JMAP retry delays so cancelled requests stop
    waiting immediately.

---
links:
  '#64': https://github.com/dahlia/upyo/issues/64
  '#72': https://github.com/dahlia/upyo/pull/72
---
 -  Added `JmapTransport.sendRaw()` to stream serialized MIME through blob
    upload, import, and submission with an explicit envelope. Raw mutations are
    not retried automatically; uncertain submission outcomes are reported as
    non-retryable to prevent duplicate delivery. [[#64], [#72]]

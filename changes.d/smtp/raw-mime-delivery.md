---
links:
  '#64': https://github.com/dahlia/upyo/issues/64
  '#72': https://github.com/dahlia/upyo/pull/72
---
 -  Added `SmtpTransport.sendRaw()` for delivering serialized MIME with an
    explicit envelope, streaming validation, DSN, and cancellation. Raw sends
    preserve existing headers and signatures and bypass configured DKIM signing.
    [[#64], [#72]]

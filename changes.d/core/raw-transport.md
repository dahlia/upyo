---
links:
  '#64': https://github.com/dahlia/upyo/issues/64
  '#72': https://github.com/dahlia/upyo/pull/72
---
 -  Added the optional `RawTransport` interface and replayable `RawMessage`
    types for delivering serialized MIME with an explicit envelope. Raw sources
    support incremental validation and cancellation. An explicit `8bit` encoding
    requires the caller to guarantee ASCII headers in nested MIME parts, which
    Upyo does not parse. [[#64], [#72]]

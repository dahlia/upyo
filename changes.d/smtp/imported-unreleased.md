---
links:
  '#42': https://github.com/dahlia/upyo/issues/42
  '#43': https://github.com/dahlia/upyo/issues/43
  '#44': https://github.com/dahlia/upyo/issues/44
  '#47': https://github.com/dahlia/upyo/pull/47
  '#48': https://github.com/dahlia/upyo/pull/48
  '#49': https://github.com/dahlia/upyo/pull/49
---
 -  Added the `requireTls` configuration option.  When enabled for a plaintext
    connection, the transport issues `STARTTLS` even if the server does not
    advertise it and fails delivery unless the TLS upgrade succeeds.  The
    option defaults to `false`; the existing protection against cleartext
    authentication to non-loopback hosts remains in effect.  STARTTLS on Deno
    requires Deno 2.7.13 or later.
 -  Fixed connection pooling when `pool` is omitted so that the documented
    default of `true` takes effect.  Dispose the transport with `await using` or
    call `closeAllConnections()` to release pooled connections when finished.
 -  Reduced SMTP round trips by sending `MAIL FROM` and all `RCPT TO` commands
    together when the server advertises the `PIPELINING` extension.  Replies,
    including multiline replies, remain associated with their commands and
    rejected recipients in server response order.
    [[#42], [#47]]
 -  Added support for the SMTP `SIZE` extension.  The transport declares each
    encoded message's size on `MAIL FROM` and returns a failed receipt before
    uploading messages that exceed an advertised fixed maximum.  Bare `SIZE`
    and `SIZE 0` advertisements continue without a local limit.
    [[#43], [#48]]
 -  Added SMTP delivery status notification requests through the RFC 3461
    `DSN` extension.  Per-message `RET` and `ENVID` options and per-recipient
    `NOTIFY` and `ORCPT` options are validated and serialized on the SMTP
    envelope.  Requests fail before `MAIL FROM` when the server does not
    advertise `DSN`.
    [[#44], [#49]]

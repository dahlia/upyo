---
links:
  '#53': https://github.com/dahlia/upyo/issues/53
  '#55': https://github.com/dahlia/upyo/pull/55
---
 -  Fixed SMTP connections to infer the `secure` default from the port.  Port
    465 uses implicit TLS; all other ports start with plaintext and upgrade with
    STARTTLS when advertised.  Set `secure: true` explicitly to use implicit
    TLS on a nonstandard port.  [[#53], [#55]]

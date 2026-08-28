---
links:
  '#45': https://github.com/dahlia/upyo/issues/45
  '#50': https://github.com/dahlia/upyo/pull/50
---
 -  Added automatic SMTPUTF8 delivery for internationalized sender, recipient,
    and reply-to addresses.  Servers must advertise `SMTPUTF8` and `8BITMIME`;
    unsupported sends fail without starting a mail transaction.  [[#45], [#50]]

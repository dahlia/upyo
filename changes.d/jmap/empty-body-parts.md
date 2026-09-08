---
links:
  '#69': https://github.com/dahlia/upyo/pull/69
---
 -  Fixed an empty `text` or `html` body being dropped from the composed
    message.  A body the caller supplied as an empty string is now sent as an
    empty part, the way *@upyo/smtp* composes it, rather than omitted.  [[#69]]

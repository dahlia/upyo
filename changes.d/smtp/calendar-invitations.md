---
links:
  '#63': https://github.com/dahlia/upyo/issues/63
  '#69': https://github.com/dahlia/upyo/pull/69
---
 -  A message carrying `calendar` is now composed with a `text/calendar`
    alternative, placed after the text and HTML bodies and Base64 encoded so
    that the object's line structure survives unchanged.  The `method`
    parameter repeats the object's own `METHOD` property, as RFC 6047 §2.4
    requires.  [[#63], [#69]]

---
links:
  '#69': https://github.com/dahlia/upyo/pull/69
---
 -  Fixed the estimated message size reported on a span and in the
    `email.message.size` histogram, which counted UTF-16 code units rather than
    the bytes it claimed.  A subject or body outside Basic Latin was
    undercounted, a Korean one by roughly two thirds.  [[#69]]

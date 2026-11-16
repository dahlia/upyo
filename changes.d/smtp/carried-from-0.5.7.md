---
links:
  '#82': https://github.com/dahlia/upyo/issues/82
  '#83': https://github.com/dahlia/upyo/pull/83
---
 -  Fixed display names such as `Doe, John` in address headers being read
    as multiple mailboxes.  ASCII names containing address punctuation are
    now quoted, with quotes and backslashes escaped.  Empty names are written
    as `""`; non-ASCII and long-word names retain their existing encoding.
    [[#82], [#83]]

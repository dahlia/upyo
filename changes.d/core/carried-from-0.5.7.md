---
links:
  '#82': https://github.com/dahlia/upyo/issues/82
  '#83': https://github.com/dahlia/upyo/pull/83
---
 -  Fixed `formatAddress()` leaving display names containing commas, periods,
    and other address punctuation unquoted.  Quotes and backslashes in names
    are now escaped, and `parseAddress()` decodes them without mistaking an
    angle bracket in a quoted name for the address delimiter.  Empty names
    are written as `""`, and name whitespace is preserved on round trips.
    [[#82], [#83]]

---
links:
  '#56': https://github.com/dahlia/upyo/issues/56
  '#59': https://github.com/dahlia/upyo/pull/59
---
 -  Added support for `Blob` and replayable async attachment factories.
    Attachment reads remain buffered, and failed reads still omit the
    attachment; caller cancellation now aborts the send instead.  [[#56], [#59]]

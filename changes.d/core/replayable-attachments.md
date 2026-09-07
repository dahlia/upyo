---
links:
  '#56': https://github.com/dahlia/upyo/issues/56
  '#59': https://github.com/dahlia/upyo/pull/59
---
 -  Added `Blob` and replayable async content factories for attachments, with
    `readAttachmentContent()` and `iterateAttachmentContent()` helpers.
    `createMessage()` now retains `File` content without reading it; use the
    helpers instead of awaiting `attachment.content` directly.  [[#56], [#59]]

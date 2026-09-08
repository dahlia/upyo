---
links:
  '#69': https://github.com/dahlia/upyo/pull/69
---
 -  Fixed the `email.content.type` span attribute and the `content_type` metric
    label, which reported `text` or `html` for a message carrying a calendar.
    Such a message is multipart on every transport, either as a
    `text/calendar` alternative or as an *invite.ics* attachment, and is now
    labelled `multipart`.  [[#69]]

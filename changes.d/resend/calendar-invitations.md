---
links:
  '#63': https://github.com/dahlia/upyo/issues/63
  '#69': https://github.com/dahlia/upyo/pull/69
---
 -  A message carrying `calendar` now sends the iCalendar object as an
    *invite.ics* attachment whose content type keeps the `method` parameter,
    ahead of the message's own attachments.  This transport cannot compose a
    `text/calendar` body alternative, so the scheduling semantics are not
    guaranteed to survive; see the documentation on calendar invitations.
    [[#63], [#69]]

 -  A calendar message is now sent individually rather than through the batch
    API, which accepts no attachments.  [[#63], [#69]]

---
links:
  '#56': https://github.com/dahlia/upyo/issues/56
  '#59': https://github.com/dahlia/upyo/pull/59
---
 -  Added incremental SMTP attachment encoding and backpressured DATA writes.
    Set `dkim.bodyMode` to `"streaming"` for bounded attachment memory with two
    source reads, or keep the default `"buffered"` mode for one read.  Changed
    replay content fails with `smtp.attachment-replay-mismatch` before
    acceptance. Source inactivity and size-limit failures close unfinished DATA
    connections. [[#56], [#59]]

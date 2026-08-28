---
links:
  '#33': https://github.com/dahlia/upyo/pull/33
---
 -  Added LogTape observability transport.
    [[#33]]

     -  Added `LogTapeTransport` class for logging email delivery lifecycle
        events with configurable categories and levels.
     -  Supports log-only development use and decorating another transport
        without changing its receipts or errors.
     -  Supports optional full-message recording as structured properties or
        as development-friendly logs with inline subjects and bodies.
     -  Supports streaming `sendMany()`, `AbortSignal` cancellation, and
        wrapped transport disposal.

---
links:
  '#68': https://github.com/dahlia/upyo/issues/68
  '#74': https://github.com/dahlia/upyo/pull/74
---
 -  Added *@upyo/mime* with `composeMessage()` for composing replayable MIME
    bytes without a transport connection, with optional DKIM signing.  Save
    the bytes as an *.eml* file or pass the result directly to SMTP or JMAP
    `sendRaw()`.  The package supports Node.js, Deno, Bun, and edge runtimes
    without Node.js compatibility.  Address line breaks and invalid custom
    header names are rejected even for directly constructed messages.
    [[#68], [#74]]

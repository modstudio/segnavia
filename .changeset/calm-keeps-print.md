---
'@segnavia/render': minor
---

A continuous book PDF now runs the frame's scripts when the book's markup or stylesheets declare `--segnavia-keep-with`, so the bridge applies the keeps before printing. Under `scripts: 'refuse'` the nonce CSP still admits only the library's own scripts.

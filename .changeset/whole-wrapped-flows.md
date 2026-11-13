---
'@segnavia/frame': patch
---

Keep every block after a wrapper element in a paginated book flow. A window that holds a wrapper whose first child has a block-start margin, such as `<div><p>…</p></div>`, now places its content at the galley offset, so later blocks are no longer clipped out of the printed book.

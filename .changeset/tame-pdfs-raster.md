---
'@segnavia/render': minor
'@segnavia/format': minor
---

Add `pdfPageImage` to rasterize a selected PDF page and box into an offline, white-ground PNG for host-managed screen renditions. It reads the crop box a page inherits from its page tree, and treats a malformed or zero-area optional box as absent. `@segnavia/format` exports `PAGE_BOXES`, the PDF page box names.

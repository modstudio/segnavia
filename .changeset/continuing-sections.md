---
'@segnavia/format': minor
'@segnavia/layout': minor
'@segnavia/html': patch
'@segnavia/frame': patch
'@segnavia/render': patch
---

A book section may set `opens: 'continue'` to join the preceding flowing section's flow without a page break, keeping its own contents entry, outline node, heading destination and running-head title. `BookOpens` gains `continue`, while a part's `opens` stays `recto`, `verso` or `any`. `continue` is refused on the first section of a division or part, on or after a non-flowing section, and together with section `numbering` or `parents`. Recto planning skips a continuing section. A page mark whose element sets `data-mark-scope="flow"` is not carried into a later section's flow, and `PaginateMark` and `PaginatePageMarks` carry that optional `scope`. The `title` running-head source shows the first section title on the page.

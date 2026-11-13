---
'@segnavia/format': minor
---

Breaking: `Document.parse` now refuses book and printed-page errors during parsing instead of deferring them until render. It also refuses `data-motif-*` fields without `data-motif`, and undeclared `data-variable` refusals now name the document node that contains them.

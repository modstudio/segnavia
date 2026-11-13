---
'@segnavia/format': minor
---

Breaking: `Document.parse` now refuses book and printed-page errors during parsing instead of deferring them until render. A paginated book without a page now uses the Book refusal wording. Parsing also refuses `data-motif-*` fields without `data-motif`, and undeclared `data-variable` refusals now name the document node that contains them.

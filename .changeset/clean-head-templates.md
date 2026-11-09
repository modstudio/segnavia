---
'@segnavia/format': minor
'@segnavia/layout': minor
'@segnavia/html': minor
'@segnavia/frame': minor
'@segnavia/render': minor
'@segnavia/idml': minor
---

Fill running furniture from named head templates and variables, and remove marks, running-head sources, and printed-page furniture paths.

Breaking for hosts:

- A parsed value's `variables` and `headTemplates` hold only the author's declarations. Join the library entries with `withLibraryEntries` where you need the full set.
- An author variable or head-template name starting with `segnavia:` is refused.
- An unclosed head-template placement, and any reserved motif key other than `segnavia:head-template` in parent head or foot HTML, are refused.
- `PLAN_VERSION` is 5, so a saved version-4 plan is refused; plan the book again.
- Variables of `of: 'document'` count across front matter and body in the body numbering system.

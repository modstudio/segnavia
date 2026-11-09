---
'@segnavia/format': minor
'@segnavia/layout': minor
'@segnavia/html': minor
'@segnavia/frame': minor
'@segnavia/render': minor
---

Pour record nodes into paginated template sections with record-scoped and
document-scoped furniture numbering.

Breaking: replace a record's `name` with `template` and text `values`.
Templates may declare `slots`; parsing now refuses unknown or unusable record
templates, incomplete values, non-text slots, parent-page ownership, continuous
books and keys also claimed by host slots. Add `record.index`, `record.count`,
`printedPage.documentNumber` and `printedPage.documentTotal` slot paths.
Saved plan version 2 carries record and whole-document numbering; recompute
saved plans made with an earlier version.

---
'@segnavia/format': minor
'@segnavia/layout': minor
'@segnavia/frame': minor
'@segnavia/render': minor
'@segnavia/html': minor
---

Add saved book pagination through format's `Plan`, `Measurements` and
`fingerprintValue`, and layout's `BookPlan`, `savePlan` and `replayPlan`.
`bookPlan` computes the saved plan. `bookPdf` now accepts the `plan` and
`breaks` options, and `describeDocument` accepts a saved `plan` and describes
its pages.

The paginate input types (`PaginateBookInput` and its parts) are now defined by
format's `Measurements` schema and re-exported by layout as types.

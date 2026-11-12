---
'@segnavia/format': minor
'@segnavia/layout': minor
'@segnavia/html': minor
'@segnavia/frame': minor
'@segnavia/render': minor
---

Add copyfit before pagination with ordered size, leading and tracking strategies,
shared fit groups, measured fit facts and `fit-limit` preflight reporting.

This is a clean break for book templates: the former region-only meaning of
`data-fit-min` and `data-fit-step` is removed. Hosts must add `data-fit` and use
the new per-strategy bound lists.

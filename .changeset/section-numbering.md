---
'@segnavia/format': minor
'@segnavia/layout': minor
'@segnavia/html': patch
'@segnavia/frame': patch
'@segnavia/render': minor
---

A paginated book section may set `numbering: { counted: false }` or `numbering: { restart: N }`. Plan folios are the single source of page numbers: `Plan.folios` entries are `string | null`, where null marks an uncounted or blank page, and must match `pages` in length. Contents numbers and running folios read them, and the printed PDF carries them as page labels. Section numbering is refused on a continuous book or with a restart beyond the division's number system.

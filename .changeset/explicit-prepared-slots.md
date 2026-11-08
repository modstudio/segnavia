---
'@segnavia/render': minor
'@segnavia/html': minor
---

Return `filledBook`, `filledPage`, `filledPages` and `filledDeck` results as `{ value, slots }`, and export `PreparedSlots` so prepared slot state can be passed explicitly after cloning a value.
`PreparedSlots` now records marks once in `frames`; each rendered document derives its grouped `marked` counts from those frames while reading the shared live fit report.

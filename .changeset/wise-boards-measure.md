---
'@segnavia/format': minor
'@segnavia/frame': minor
---

Add optional measured sizes to `BoardLabel` and export `boardShapes`, `BoardItemFact`, `provisionalShape`, and `resolvedShape` from format.

The public `resolvedShape` export from frame now takes a `BoardItemFact` instead of a `ResolvedBoardItem`; callers must pass the format shape fact.

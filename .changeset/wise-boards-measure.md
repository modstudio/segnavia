---
'@segnavia/format': minor
'@segnavia/frame': minor
---

Add optional measured sizes to `BoardLabel` and export `boardShapes`, `BoardItemFact`, `labelShape`, `provisionalShape`, and `resolvedShape` from format.

Boards whose items reuse one address for different asset kinds are now refused; hosts with such stored boards must give each kind its own address.

The public `resolvedShape` export from frame now takes a `BoardItemFact` instead of a `ResolvedBoardItem`; callers must pass the format shape fact.

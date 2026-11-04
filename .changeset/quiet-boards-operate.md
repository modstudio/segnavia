---
'@segnavia/format': minor
---

Add granular, invertible board operations. `BoardOp` is a Zod schema published as `jsonSchemas().boardOp`; `applyBoardOps` refuses malformed or stale operations, `diffBoards` computes the operations between two boards, and `invertOps` reverses them. `Board.parse` now keeps the first occurrence of a section member listed more than once, instead of accepting the repeat.

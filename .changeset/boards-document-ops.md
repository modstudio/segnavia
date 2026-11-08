---
'@segnavia/format': minor
'@segnavia/frame': minor
---

Use `DocumentOp` and `DocumentBatch` as the board operation model, with rebased
per-writer undo and remote edits through `BoardEditing.applyRemote`.

This removes `BoardOp`, `applyBoardOps`, `invertBoardOps`, `diffBoards`,
`SectionFields`, and `jsonSchemas().boardOp`.

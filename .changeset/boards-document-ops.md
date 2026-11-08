---
'@segnavia/format': minor
'@segnavia/frame': minor
---

Use `DocumentOp` and `DocumentBatch` as the board operation model, with rebased
per-writer undo and remote edits through `BoardEditing.applyRemote`.

`editBoard` now takes a parsed board `Document` and returns the edited
`document` with its `batch`. `BoardEditing.apply` and `applyRemote` refuse a
conflicting batch whole and direct the host to rebuild it against the current
board.

This removes `BoardOp`, `applyBoardOps`, `invertBoardOps`, `diffBoards`,
`SectionFields`, and `jsonSchemas().boardOp`.

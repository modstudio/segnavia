---
'@segnavia/html': minor
'@segnavia/format': minor
---

Add the document block view and block operations. `blockView` lists every block in document order with its id, kind, text, class, attributes, content address and enclosing block. `insertBlock`, `setBlock`, `moveBlock` and `removeBlock` compile an edit to `setContent` operations with priors, so `applyOps` checks staleness and `inverseBatch` undoes it. They take `BlockOpOptions` with the host's `newId`. A block may stand only where its kind and its parent allow, and every fragment an operation writes must re-parse to itself. Block operations do not sanitize; speaker notes are plain text and hold no blocks.

`@segnavia/format` now exports `DOCUMENT_NODE_MODEL`, `documentEntries` and `requireParsedDocument`, so other packages read the document model rather than copying it.

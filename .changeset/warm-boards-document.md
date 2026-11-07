---
'@segnavia/format': minor
'@segnavia/frame': major
---

Pass `{ type: 'document', kind: 'board', ... }` to `<segnavia-board>`. Its `board` property, change and share events, and editing callback now carry the board `Document`; `documentFromBoard` raises internal board edits without dropping the source document's root fields.

Board item resolvers now return deck and page `Document` payloads, and paper item resolvers return page or printed `Document` payloads.

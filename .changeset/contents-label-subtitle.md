---
'@segnavia/format': minor
'@segnavia/html': minor
'@segnavia/frame': patch
'@segnavia/render': patch
---

A book section may set `contentsLabel` and `subtitle`. The label replaces the section title in the contents entry and the PDF bookmark, and the subtitle sits beneath the contents entry. Each takes its own text's direction first through `entryDirection`. An empty label or subtitle is refused. A placed section now keeps every section field when it resolves.

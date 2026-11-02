---
'@segnavia/frame': minor
'@segnavia/html': minor
'@segnavia/render': minor
---

Draw markdown Mermaid diagrams offline inside page frames before readiness and pagination, with per-diagram failure output and bidirectional labels.

The diagrams entry exports the nonce-authorized drawing script. Server render inlines it and waits for the drawing before capture. Any page body carrying the `pre[data-segnavia-diagram="mermaid"]` placeholder is drawn, HTML included. Markdown outlines may now receive the markdown body object so HTML and outline conversion share one pass.

---
'@segnavia/frame': minor
'@segnavia/diagrams': minor
'@segnavia/render': minor
---

Move Mermaid drawing into the optional `@segnavia/diagrams` package behind a provider seam.

Hosts that draw diagrams in their own bundle add `import '@segnavia/diagrams/auto'`, or call `registerDiagramProvider(diagrams)`.

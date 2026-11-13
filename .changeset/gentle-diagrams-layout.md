---
'@segnavia/frame': minor
'@segnavia/diagrams': minor
'@segnavia/render': minor
'@segnavia/html': minor
---

Draw Mermaid diagrams through the layout provider runtime.

- Replace `withDiagramScript` with `withLayoutScripts`.
- Replace `loadDiagramScript` with `loadLayoutScripts`.
- Replace `loadDiagramScriptResult` with the rejection result from `loadLayoutScripts`.
- Replace `DIAGRAM_READY_EXPR` with layout phase settlement.
- Replace `DIAGRAM_READY_NAME` with `segnaviaLayout.run('galley')` settlement.
- Replace `DIAGRAMS_DRAWN_ATTRIBUTE` with layout phase settlement.
- Replace the render option `diagramScript` with `layoutScripts`.

---
'@segnavia/format': minor
'@segnavia/render': minor
'@segnavia/frame': minor
---

Take a page Document as the designed-cover input and refuse the legacy Page shape. Put the cover print setting on the Document root; a print setting on the page node is not read. The cover page body must contain stored HTML, so pass a markdown Document through `@segnavia/html`'s `parseDocument` first. Parsed covers still expose the lowered Page value to render and frame consumers.

---
'@segnavia/format': major
'@segnavia/frame': major
'@segnavia/html': major
'@segnavia/render': major
'@segnavia/capture': major
---

Replace the separate page, deck, render, image and local-font ceilings with one format-owned `Limits` value.

Resolve document page declarations against host ceilings and use one refusal text at every enforcement site.

Render hosts rename `maxSheets` to `sheets` and `maxBytes` to `bytes`; deck hosts rename `maxSlides` to `slides`, `maxSlideBytes` to `slideBytes` and `maxNotesBytes` to `notesBytes`. Local-font count and byte ceilings move from `localFonts.limits` to `limits.localFonts`. Capture keeps its own `output.maxBytes` option and maps it to `limits.bytes`.

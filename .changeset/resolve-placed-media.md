---
'@segnavia/html': minor
'@segnavia/format': minor
'@segnavia/frame': minor
'@segnavia/render': minor
'@segnavia/react': minor
---

Resolve placed media in page and book HTML through one host seam: an `img` with `data-segnavia-media` is resolved through the `placements: { resolve, report? }` option on page, paper, document, book, thumbnail and board elements, browser `printPages` and the page and book render options. `@segnavia/format` exports `FLUID_WIDTH`, the viewport width of a fluid page.

---
'@segnavia/format': minor
'@segnavia/html': minor
'@segnavia/frame': minor
'@segnavia/render': minor
---

Compile document style sheets into isolated CSS cascade layers in every frame.

This is a breaking document-format change. `style` is now a `StyleSheet`.
Book `css` moves to `style.css`, and book and page font references move to
`style.fonts`; decks use the same font location. Books and printed pages accept
all style sections, pages omit `pageGeometries`, decks accept `tokens`,
`textStyles`, `fonts` and `css`, and boards accept no style sections.

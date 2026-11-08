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

The former `bookStylesheet` helper is removed; compile `style` with
`compileStyleSheet` and pass its separate sheets to the frame instead.

A style sheet that cannot merge (an unknown `basedOn` or token, a cycle, or a
chain deeper than 8) is refused with `StyleSheetRefusedError` from
`@segnavia/frame/bridge`, and with `RenderRefusedError` from render.
`frameDocument` without `sheets` emits the compiled base layer.

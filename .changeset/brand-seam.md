---
'@segnavia/format': minor
'@segnavia/frame': minor
'@segnavia/html': minor
'@segnavia/render': minor
'@segnavia/react': minor
---

Name a brand from any document and resolve it through the host.

A deck, book, printed page, page or board may set `brand` to a name. The host
keeps the brand and supplies it through `BrandSource`: the `brands` property on
`<segnavia-page>`, `<segnavia-paper>`, `<segnavia-board>`, `<segnavia-stage>`
and `DeckController`, and the `brandSource` option on the render entry points.
The resolved brand is layered under the document's own style. A board's brand
is the default for each item that names none, and an item's own brand replaces
it whole. A brand the host does not supply, or one that is not a valid style
sheet, is refused, naming the brand; nothing renders unbranded. A host that
lowers a document by itself calls `resolveBrand` first.

`exportDesignTokens` and `importDesignTokens` move a brand's color, dimension
and font-family tokens to and from the W3C design-tokens format.
`brandSpecimen` builds a book showing a brand in English or Hebrew.

`StyleSheet` now refuses an unknown key at every level, naming its path. Remove
any stray keys from stored style sheets before upgrading.

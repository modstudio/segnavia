---
'@segnavia/format': minor
'@segnavia/layout': minor
'@segnavia/html': minor
'@segnavia/frame': minor
'@segnavia/render': minor
'@segnavia/idml': minor
---

Place parent-page regions on any edge of the page. A parent page declares `regions: { [name]: { edge, html } }`, with `edge` one of `blockStart`, `blockEnd`, `inlineStart` and `inlineEnd`. A region fills the margin band on its edge: block-edge regions are as wide as the text area, and inline-edge regions are as tall as it. The binding and outer edges mirror between recto and verso, and they flip in a right-to-left book. `basedOn` merges regions by name. Layout exports the pure `regionBox`, which the composer and the PDF margin layer both use.

A book's own parent pages now reach the PDF margin layer, and a continuous book's margin layer follows section and book `parentRules`. Region HTML can be edited through document commands: `setContent` on a parent page's `regions` takes the region name as its key and keeps the region's edge.

Breaking for hosts:

- `head` and `foot` are removed from parent pages and are refused with a remedy. Declare `regions: { head: { edge: 'blockStart', html } }` or `regions: { foot: { edge: 'blockEnd', html } }`. The built-in parents declare these two regions.
- `regions` takes `{ edge, html }` values instead of HTML strings.
- Composed pages mark each region with `data-segnavia-region` and `data-segnavia-edge`, replacing `data-segnavia-head` and `data-segnavia-foot`.
- A `setContent` on parent-page `regions` without a key, or with a region name the parent does not declare, is refused.

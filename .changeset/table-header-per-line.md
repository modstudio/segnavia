---
'@segnavia/format': minor
'@segnavia/layout': minor
---

Move the repeated table header height from `PaginateBlock.headerHeight` to `PaginateLine.headerHeight` in the `Measurements` schema. A page that starts at a line reserves the headers of every table crossing that line, so a break in a block's paragraphs reserves nothing. Set `headerHeight` on the measured line instead of the block; a block-level `headerHeight` is now dropped when measurements are parsed.

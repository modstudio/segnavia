---
'@segnavia/format': minor
'@segnavia/html': minor
'@segnavia/frame': minor
'@segnavia/render': minor
---

Fit a template region's text to its box. A `[data-region]` element may declare `data-fit-min` and `data-fit-step` as absolute CSS lengths. Its authored font size is the maximum, and the paginated composer steps the size down until the region's text fits, on screen and in the PDF alike. Text still overflowing at the minimum goes into the overflow report. A minimum above the authored size is reported as its own overflow entry. An invalid, non-positive or non-absolute value in template or region HTML is refused at build.

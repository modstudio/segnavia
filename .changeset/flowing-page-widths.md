---
'@segnavia/format': minor
'@segnavia/frame': minor
'@segnavia/render': minor
'@segnavia/react': minor
---

Add full, standard, wide and numeric widths for flowing pages, with shared host overrides across browser and server surfaces.

The `FLUID_WIDTH` format export is removed. Use `PAGE_WIDTHS` or `resolvePageWidth` instead.

Legacy `fluid` page data now parses as `{ width: 'full', height: 'auto' }`. Existing cover digests therefore change once, so hosts should expect to redraw cached cover images once. Re-serializing a parsed legacy page writes the new shape, which older library versions cannot read.

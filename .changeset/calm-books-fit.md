---
'@segnavia/format': minor
'@segnavia/layout': minor
'@segnavia/html': minor
'@segnavia/frame': minor
'@segnavia/render': minor
---

Add copyfit before pagination with ordered size, leading and tracking strategies,
shared fit groups, measured fit facts and `fit-limit` preflight reporting.

This is a clean break for book templates: the former region-only meaning of
`data-fit-min` and `data-fit-step` is removed. Without `data-fit`, the new
vocabulary defaults to the `size` strategy.

The `fitRegionSize` export is removed from `@segnavia/html`. Preflight fit facts
now have `{ subject, group?, values }` instead of `{ group, size }`; hosts that
read those facts must use the per-strategy `values` map.

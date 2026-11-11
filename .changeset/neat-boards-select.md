---
'@segnavia/frame': minor
'@segnavia/format': minor
---

Select, focus, remove and reveal board labels and sections alongside items, and expose the shared `boardFocusOrder` policy.

Breaking for hosts: `segnavia-board-selection` now reports tagged `entries` and `entry` instead of `nodes` and `node`. Read `entry.kind`, then `entry.item`, `entry.label` or `entry.section`; the kind-specific item and label fields remain and section fields are added. The `items` and `labels` arrays, and their `item` and `label` singletons, now follow selection order instead of board order.

---
'@segnavia/html': minor
'@segnavia/render': minor
'@segnavia/frame': minor
---

Resolve a deck's or book's as-of day in server PDF and image renders, fill its reserved as-of bindings, and date deterministic output from that day.

`expandFrameBookValue` from `@segnavia/frame/motifs` takes the as-of `day` before `profile`, as `expandFramePage` does. A caller that passes `profile` positionally moves it one place later. `resolveDeckMedia` and `resolveMediaContent` from `@segnavia/frame/print-document` take an optional trailing `day`.

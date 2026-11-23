---
'@segnavia/render': minor
---

Report `compose`, `set`, `impose` and `finish` progress for PDF and image renders, including original input indexes for `pagesPdf`. This replaces compose progress `{ pages, total }` with render progress `{ stage, stages, done, total, input? }`; hosts must read `done` instead of `pages`.

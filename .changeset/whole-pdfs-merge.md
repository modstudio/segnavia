---
'@segnavia/render': minor
---

Add `renderer.mergePdfs` to merge finished library PDFs into one, with one outline entry per part above that part's own outline. Links land in their own part, structure is kept when every part is tagged, and failed parts are collected as a `pdf-parts` refusal or skipped under `skipRefused`.

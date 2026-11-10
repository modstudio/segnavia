---
'@segnavia/frame': minor
'@segnavia/html': minor
'@segnavia/render': minor
---

Add server preflight reports to composed book, printed-page and page-image renders, and let document descriptions carry a preflight section. A render refuses a preflight profile that does not resolve before it starts the browser. Frame exports `PREFLIGHT_ATTRIBUTE` from its book-document and printed-page-document entries.

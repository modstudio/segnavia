---
'@segnavia/html': patch
---

A `links` policy now governs only link elements (`a` and `area`). An href on any other element, such as SVG `image`, `use` or `feImage`, is judged as a fetch: only a same-document fragment or a safe data image is kept, in `sanitize` and in `fill`. Every URL check, including `src`, `srcset` and `safeImageSource`, now reads a value the way the URL parser does, so a value carrying U+007F is no longer mistaken for a fragment or a data image.

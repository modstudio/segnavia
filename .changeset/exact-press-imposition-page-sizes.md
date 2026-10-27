---
'@segnavia/render': patch
---

Correct Chromium's snapped press-page and imposition-piece PDFs to the exact paper they were printed at before embedding them. A press page or imposition piece that Chromium printed more than 2 pt from its paper is now refused, not drawn at the wrong size.

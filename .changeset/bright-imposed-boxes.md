---
'@segnavia/format': minor
'@segnavia/render': minor
---

Declare trim and bleed boxes on every imposed PDF page. A composed sheet declares its imposed area: the union of its cells' trim and of their realized bleed. A printed page under an identity imposition declares its own press boxes, which are the sheet when it has no bleed. Format exports `impositionBoxes` for the pure per-side geometry.

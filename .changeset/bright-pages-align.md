---
'@segnavia/format': major
'@segnavia/frame': major
'@segnavia/html': major
'@segnavia/render': major
'@segnavia/idml': major
'@segnavia/capture': major
'@segnavia/diagrams': patch
---

Replace package-local paper, margin, size, and direction types with the shared format values.

Book and parent-page content margins now require all four logical edges and refuse legacy physical or inner/outer names.

Print margins are binding-relative, so right-to-left single-page printing mirrors the inline edges.

Raster media intrinsic sizes now require whole pixels, while vector and document media sizes remain point-valued and may be fractional.

The IDML package no longer exports `IdmlMargin`; IDML page margins use the shared `PhysicalMargin` type, in points.

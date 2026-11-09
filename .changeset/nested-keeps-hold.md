---
'@segnavia/format': patch
'@segnavia/frame': patch
'@segnavia/layout': patch
---

Paginated books now honor keeps on nested blocks. A list item or other
block inside a container that sets `break-inside: avoid` is no longer split
across pages. A nested heading or speaker kept with the next element moves
with the block that follows its container instead of ending a page alone.

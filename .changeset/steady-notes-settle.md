---
'@segnavia/frame': patch
---

Keep paginated page notes inside their planned space when fonts or images finish loading after composition: the composer re-derives each note view's extent from its laid-out lines and re-stacks the views, and refuses a note whose lines changed after pagination or whose settled stack would move into the body.

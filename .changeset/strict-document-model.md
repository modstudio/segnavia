---
'@segnavia/format': minor
---

Breaking: document parsing now refuses keys the document model does not define instead of silently removing them. Each refusal names the full path and unknown key; remove the key, or move a parent page's `margin` to `geometry.margin`, to clear it.

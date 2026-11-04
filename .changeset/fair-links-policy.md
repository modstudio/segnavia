---
'@segnavia/html': minor
---

Add a shared host link policy for authored and bound links in `sanitize` and `fill`.
An authored link that the URL parser cannot parse, such as one with a space in its host, is now refused instead of being kept broken.

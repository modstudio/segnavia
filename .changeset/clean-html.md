---
'@segnavia/html': minor
'@segnavia/format': patch
---

Add `cleanHtml(html, profile)`, which reduces any HTML to what an `HtmlProfile` admits and reports each removed element, attribute, link scheme and style as `DroppedContent`, at most 256 entries with their paths. Its output is stable when cleaned again. `IMAGE_DRAWING_VERSION` and `COVER_DRAWING_VERSION` rise to 4 because the sanitizer they fingerprint changed; drawn pictures are unchanged, so hosts redraw kept pictures once.

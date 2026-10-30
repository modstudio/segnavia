---
'@segnavia/frame': minor
'@segnavia/html': minor
'@segnavia/render': minor
---

Add page references to books. An empty `<a href="#id" data-ref="page"></a>` shows the folio of the page where its target lands, in that part's numbering, in a paginated book and in a continuous PDF. In a continuous book on screen it stays an empty link. A missing target, or a target id used in more than one section, is refused.

Contents page numbers are now page references. The number is `a.segnavia-contents-page[data-ref="page"]`, replacing `span.segnavia-contents-page[data-target]`, and it no longer carries `data-target`. Host CSS or scripts that select the span or `data-target` need updating.

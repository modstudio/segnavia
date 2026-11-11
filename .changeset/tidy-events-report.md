---
'@segnavia/frame': minor
'@segnavia/react': minor
---

Declare every report event dispatched by the page, paper, document, book, and stage elements, including typed Vue listeners. Breaking: a book `error` is now an `ErrorEvent`; read `event.message` or `event.error` instead of `event.detail.message`.

Add typed React props for report events. The five elements' `onError` callbacks now receive the native `ErrorEvent` rather than React's synthetic error event.

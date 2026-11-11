---
'@segnavia/frame': minor
'@segnavia/react': minor
---

Declare every event dispatched by the page, paper, document, book, and stage elements, including paper `change` and the document slots, page, and change events, with typed Vue listeners. Breaking: a book `error` is now an `ErrorEvent`; read `event.message` or `event.error` instead of `event.detail.message`. Every element `error` now carries an `Error` in `event.error`.

Add typed React props for report events. The five elements' `onError` callbacks now receive the native `ErrorEvent` rather than React's synthetic error event.

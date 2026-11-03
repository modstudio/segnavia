---
'@segnavia/frame': minor
---

`DeckController.goToSlide(id)` navigates by slide id. It resolves `true` when the deck is on that slide afterward, and `false` for an unknown id or a navigation that did not land there. A navigation that waited on a navigation guard while a new deck loaded is dropped rather than applied to the new deck.

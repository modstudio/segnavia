---
'@segnavia/format': major
'@segnavia/frame': major
'@segnavia/render': major
'@segnavia/react': major
---

Pass `{ type: 'document', kind: 'deck', ... }` for decks and `{ type: 'document', kind: 'page', ... }` for screen pages. Deck and page entry points no longer accept the old `Deck` and `Page` input shapes, and `deckFromSlides` now returns a deck `Document`.

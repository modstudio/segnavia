---
'@segnavia/format': minor
'@segnavia/frame': minor
'@segnavia/render': minor
---

Put press fields in a printable Document's `print` setting for decks, books and printed pages. Their PDFs now write trim and bleed boxes and crop marks on every page, and deck notes sheets take press fields from the deck's `print`.

Imposition no longer accepts `bleed` or `safe`, and `notesPaper` no longer accepts press fields. Pieces on one imposition must have the same `print.bleed` and `print.safe`; composition refuses the first piece that differs. Invalid paper fields on deck and book `print` values, removed imposition fields, removed `PrintOptions.sheet`, and press fields on `notesPaper` are refused with their replacement settings.

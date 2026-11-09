---
'@segnavia/format': minor
'@segnavia/html': minor
---

Change the default note-symbol sequence to `* § ‖ ¶`. This is a breaking
0.x change for books that use `marker: 'symbols'`; restore dagger marks with
`marker: { symbols: ['*', '†', '‡', '§'] }`.

A note series may now provide its own repeating `{ symbols: [...] }` sequence
or use `{ mark: '⁂' }` to give every note the same fixed, unnumbered mark.
Used series are refused when their repeated marks can overlap, including when
a symbol-like mark uses only the characters of a used number system.

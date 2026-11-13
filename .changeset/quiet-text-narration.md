---
'@segnavia/format': minor
'@segnavia/voice': minor
'@segnavia/frame': minor
---

Accept text-only narration paced by a deck reading speed, with actionable narration-kind refusals. Shared pacing now gives pointed and unpointed Hebrew the same duration by excluding combining marks, and paced voice provider IDs name this timing-rule version so cached timings are not reused.

Breaking: `slideDurationMs`, `phaseBounds`, `slideStateAt`, `momentAt`, `timedClock`, `speechClock` and the controller `clock` option now take the deck's pacing input (`NarrationPacing`, the deck's `readingSpeed`) as a required argument, so every host times text narration at the deck's reading speed. Pass the deck where you call them.

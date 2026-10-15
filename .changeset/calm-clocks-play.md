---
'@segnavia/format': minor
'@segnavia/frame': minor
---

Add slide timing, pure deck timelines, continuous playback, seek, pause-resume, and persisted viewer mute and caption settings.

Breaking: the `ControllerOptions.clock` callback now receives `(slide, audio)` instead of `(narration, audio)`.

Breaking: `momentAt(...).annotations` is now `number[] | null`, where `null` means every annotation shows (a slide without narration).

Behaviour change for existing hosts: pause keeps the position, and Play resumes from it rather than restarting the slide. Play after the deck has ended restarts from the first slide.

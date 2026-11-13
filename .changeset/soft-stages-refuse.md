---
'@segnavia/frame': minor
---

Change the controller `error` event to an `ErrorEvent` carrying a `DeckRefusedError` or `SlideRefusedError`, replacing the custom-event detail `{ index, message }`; a slide refusal's index is now `event.error.index`. `SlideFrameError` is now a `Refusal` with code `slide-frame`, a message that wraps its cause, and constructor `(slideId, index, cause)`. Add the required `refused` field to `PlayerLabels`. Add the stage's headless `data-refused`, `refusal`, and `refusalchange` state, including frame failures retained by pooled slide frames, and show that refusal in the styled player.

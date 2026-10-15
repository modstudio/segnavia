---
'@segnavia/frame': minor
---

The finished player gains a configurable two-row control bar: the track on top, then time, previous/play/next centred, and the host's actions, mute, captions, notes and presentation.

- New styled controls: `<segnavia-time>`, `<segnavia-mute>` and `<segnavia-captions>`.
- In continuous playback the track is one seekable timeline, proportional per slide with visible breaks. It can be clicked, dragged, or used as a slider from the keyboard.
- New player attributes `playback`, `captions` and `presentation` (`window`, `native` or `off`), observed whenever they are set.
- `actions` and `below` slots for host content.
- Exported parts for every control and caption word state (`word-current`, `word-spoken`).
- Presentation switches the player to its dark colour scheme.
- Icons: the controls use Lucide icons, copied in with their ISC licence in `THIRD-PARTY-NOTICES`, with no new dependency. The optional entry `@segnavia/frame/icons` exports them for headless hosts, and the headless entry does not include them. Every icon can be replaced through a named slot (`icon-play`, `icon-mute` and so on).
- `PlayerLabels` gains keys for the new controls. A partial labels object falls back to English for any missing key.

Behaviour change: `<segnavia-fullscreen>` and the player now present in the window by default. Browser fullscreen is opt-in with `mode="native"` or `presentation="native"`.

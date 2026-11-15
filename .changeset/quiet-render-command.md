---
'@segnavia/render': minor
---

Ship the `segnavia-render` command for offline PDF rendering from one JSON standard-input request, with typed JSON refusal and failure outcomes. `directoryFontSource` now refuses an unusable `src` or root with a `RenderRefusedError` whose code is `font-source` and whose subject names the path.

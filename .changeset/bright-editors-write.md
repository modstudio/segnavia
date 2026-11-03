---
'@segnavia/frame': minor
'@segnavia/markdown-editor': minor
'@segnavia/react': minor
---

Move the Markdown editor into the optional `@segnavia/markdown-editor` package.

Hosts that used `@segnavia/frame/markdown-editor` install `@segnavia/markdown-editor` and its peers and import from it. `@segnavia/react/markdown-editor` keeps its path but now needs `@segnavia/markdown-editor` installed.

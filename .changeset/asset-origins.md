---
'@segnavia/format': minor
'@segnavia/frame': minor
'@segnavia/html': minor
'@segnavia/react': minor
'@segnavia/render': minor
---

Allow author scripts, styles, fonts and images through one kind-aware origin policy in live frames and offline rendering. Google Fonts and pinned script CDNs are approved by default; hosts add `{ origin, kinds }` entries with `origins`.

Breaking: replace `dependencyOrigins: [origin]` with `origins: [{ origin, kinds: ['script', 'style', 'font'] }]`, and replace the render `dependencies(url)` cache with `assets(url, { kind, signal })`. Rendered assets default to 50 MiB per document and 10 MiB each through host-only `limits.assets`.

A remote image in converted Markdown is kept only when its image origin is approved by `origins`; converter protocol allowances no longer bypass the origin policy.

`srcset` candidates follow the same origin policy as `img src`.

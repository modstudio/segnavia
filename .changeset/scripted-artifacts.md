---
'@segnavia/format': minor
'@segnavia/html': minor
'@segnavia/frame': minor
'@segnavia/render': minor
---

Store artifact-style HTML unchanged as a scripted page. Hosts can set `dependencyOrigins` for scripts, styles and fonts and supply the render-time `dependencies` cache seam. Static markup and render requests to known package CDNs require exact versions; the viewer CSP is origin-granular, so runtime imports at an approved origin are not version-pinned. Scripted frames add `allow-forms` under `form-action 'none'` so submit handlers run without allowing a real submission, and never add `allow-same-origin`. Scripted viewers now refuse remote images and connections through a tighter CSP.

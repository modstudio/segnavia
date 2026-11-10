---
'@segnavia/format': minor
'@segnavia/frame': minor
'@segnavia/render': minor
---

Add bounded preflight profiles, issues and layout facts for composed books and printed pages. Browser book and page elements now emit live `preflight` reports, and strict profiles refuse overset regions or furniture.

Breaking on 0.x: preflight replaces the `data-segnavia-region-overflow` and `data-segnavia-furniture-overflow` attributes. Render's `OverflowReport` no longer carries region or furniture entries; server-side preflight arrives in a later release.

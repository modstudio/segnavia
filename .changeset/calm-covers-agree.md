---
'@segnavia/format': minor
---

Accept the stored `CoverInput` in `coverDigest`, matching the renderer's
`coverImage` input. This breaking 0.x change refuses a parsed `Cover` in
`coverDigest`; holders of one can pass `coverDigestMaterial(cover, options)` to
`digestCoverMaterial`.

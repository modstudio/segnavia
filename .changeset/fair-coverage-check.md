---
'@segnavia/format': minor
'@segnavia/frame': minor
'@segnavia/html': minor
'@segnavia/react': minor
'@segnavia/render': minor
---

Change preflight coverage shortfalls into the new `coverage-incomplete` check,
reported as a warning by default and refused under `strict`. Report `status` no
longer includes `incomplete`; hosts may turn the new check `off` in a custom
profile.

---
'@segnavia/format': minor
'@segnavia/html': minor
'@segnavia/render': minor
---

Report each refused asset reference once with its URL, optional origin, fetch kind, stable reason, message and clearing advice. Script sources are now reported when scripts are off, and relative CSS URLs and imports are reported with their authored values.

Breaking for hosts:

- `assetOriginRefusals` returns `AssetRefusal[]` instead of `string[]`. Read `refusal.message` for the human reason and `refusal.advice` for what clears it.
- The refused branch from `originDecision` is `{ allowed: false, refusal }` instead of `{ allowed: false, reason }`. Read `refusal.message` and `refusal.advice` instead of parsing `reason`.
- A render now refuses a relative or protocol-relative `url()` or `@import` in author CSS.

---
'@segnavia/html': minor
---

Sanitize fetching CSS constructs at rule and declaration granularity. `SanitizeOptions.dataFonts`, also accepted by `fill` and motif expansion, keeps author-embedded data fonts when true and defaults to false.

`findActiveContent` may now report `<style> @import`, `<style> url()`, `<style> image-set()`, or `<style> data font`, and the same strings with `tag[style]` in place of `<style>`, where `tag` is the element name. These replace the previous bare `<style>` and `tag[style]` reports.

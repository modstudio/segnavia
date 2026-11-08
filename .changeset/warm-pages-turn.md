---
'@segnavia/frame': minor
'@segnavia/render': minor
---

Resolve every ordinary page frame's root direction, and its print margins, from
one rule: a `dir` on the author's own `<html>` root, then the page's `dir`, then
its `lang`, then the first strong letter of its visible text, with left to right
as the fallback. A Hebrew page with no `dir` now lays out right to left. A `dir`
or `lang` the author's root declares is kept and never duplicated.

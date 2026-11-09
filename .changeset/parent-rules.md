---
'@segnavia/format': minor
'@segnavia/layout': minor
'@segnavia/html': minor
'@segnavia/frame': minor
'@segnavia/idml': minor
---

Select each page's parent page by an ordered list of rules.

`parentRules` is a list of `{ when?, parent }` on a document, section, template
or part. A rule's `when` may name a position (`documentFirst`, `documentLast`,
`sectionFirst` or `sectionLast`), a face (`recto` or `verso`) or `blank`. The
first rule whose stated conditions all match wins, and the last rule is the
unconditional default. A section's list replaces the template's, the
template's replaces the book's, and the book's replaces the built-in lists for
flowing, templated and designed pages. Printed documents take a list on the
document and on each section. Selection runs while pages fill, then again over
the finished pages, and a parent change that would alter the text area is
refused.

Breaking: `parentRules` replaces the per-role `parents` on book sections,
parts and templates, and `rules` on printed pages. Each old field is refused
with a remedy naming `parentRules`. Parsing refuses a host parent page named
under the reserved `segnavia:` namespace (base a new name on the built-in
instead), a `when` with no condition, a default rule that is not last, a rule
naming an unknown parent, and `parentRules` on a template used by a record.
`Measurements.parentNames` is removed. Saved plan version 4 includes each
page's parent page in its fingerprint; recompute saved plans made with an
earlier version.

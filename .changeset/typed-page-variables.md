---
'@segnavia/format': minor
'@segnavia/layout': minor
'@segnavia/frame': minor
---

Declare typed variables and resolve them for every planned page.

A `text` variable takes its value from the content or from section titles and
picks the value at the page's first line (`start`), the first set on the page
(`first`) or the last (`last`), carrying a value across pages that set none.
`folio` and `pages` variables give the page's folio and the page total of the
division numbering, the whole document or the page's record. Content refers to
a variable with `data-variable`, and each page's resolved values are in
`PlanPage.variables`.

Breaking: a variable is typed by `kind` (`text`, `folio` or `pages`) instead of
`valueType`, and the unsupported `date` and `meta` value types are no longer
accepted. Parsing refuses an undeclared `data-variable` reference, a repeated
variable name and a name under the reserved `segnavia:` prefix. `Measurements`
carries the declared `variables`. Saved plan version 3 hashes each page's
resolved variables; recompute saved plans made with an earlier version.

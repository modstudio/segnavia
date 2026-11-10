# @segnavia/layout

## 0.54.0

### Minor Changes

- 24c5777: Fill running furniture from named head templates and variables, and remove marks, running-head sources, and printed-page furniture paths.

  A text variable can read a named enclosing part's title, replacing `runningHead: { part }`.

  Breaking for hosts:

  - A parsed value's `variables` and `headTemplates` hold only the author's declarations. Join the library entries with `withLibraryEntries` where you need the full set.
  - An author variable or head-template name starting with `segnavia:` is refused.
  - An unclosed head-template placement, and any reserved motif key other than `segnavia:head-template` in parent head or foot HTML, are refused.
  - `PLAN_VERSION` is 5, so a saved version-4 plan is refused; plan the book again.
  - Variables of `of: 'document'` count across front matter and body in the body numbering system.

- c2e0bbb: Add document metadata variables for page furniture, including locale-aware author lists and book-title heads.

### Patch Changes

- Updated dependencies [24c5777]
- Updated dependencies [c2e0bbb]
- Updated dependencies [a98274d]
- Updated dependencies [9fb55dd]
  - @segnavia/format@0.54.0

## 0.53.0

### Minor Changes

- 252b705: Select each page's parent page by an ordered list of rules.

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

### Patch Changes

- 56bb43a: Include each package's changelog in its published tarball.
- 358b110: Paginated books now honor keeps on nested blocks. A list item or other
  block inside a container that sets `break-inside: avoid` is no longer split
  across pages. A nested heading or speaker kept with the next element moves
  with the block that follows its container instead of ending a page alone.
- Updated dependencies [370e995]
- Updated dependencies [b44a38d]
- Updated dependencies [d90ef76]
- Updated dependencies [30bd6b7]
- Updated dependencies [56bb43a]
- Updated dependencies [b5cde83]
- Updated dependencies [7f5ed55]
- Updated dependencies [41c3b46]
- Updated dependencies [1bd389b]
- Updated dependencies [358b110]
- Updated dependencies [252b705]
- Updated dependencies [6b4d309]
- Updated dependencies [25f56a9]
- Updated dependencies [dfbbb55]
- Updated dependencies [b157cf9]
  - @segnavia/format@0.53.0

## 0.52.0

### Minor Changes

- 719d636: Declare typed variables and resolve them for every planned page.

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

### Patch Changes

- Updated dependencies [719d636]
  - @segnavia/format@0.52.0

## 0.51.0

### Minor Changes

- 1395b57: A book section may set `opens: 'continue'` to join the preceding flowing section's flow without a page break, keeping its own contents entry, outline node, heading destination and running-head title. `BookOpens` gains `continue`, while a part's `opens` stays `recto`, `verso` or `any`. `continue` is refused on the first section of a division or part, on or after a non-flowing section, and together with section `numbering` or `parents`. Recto planning skips a continuing section. A page mark whose element sets `data-mark-scope="flow"` is not carried into a later section's flow, and `PaginateMark` and `PaginatePageMarks` carry that optional `scope`. The `title` running-head source shows the first section title on the page.
- 8ae6b29: A printed Document may hold one or more flowing `section` children instead of a single `page`. Each section has exactly one `flow` child and may set `title`, `opens` and `numbering`. A printed section refuses `parents`, `contents`, `contentsLabel`, `subtitle`, `headTemplate` and `pageGeometry`, and a first section that opens with `continue` is refused. Folios come from the section plan, so an uncounted cover carries no number, while printed-page rules choose only each page's parent, face, side and role. `printedPage.total`, in books and printed documents, is now the folio of the last counted body page (falling back to the last counted page), so an uncounted cover no longer adds to "page i of m". `<segnavia-page>`, `pagePdf` and `pagesPdf` compose sectioned printed documents, and `@segnavia/html` exports `resolvePrintedPageHtml`, `isPrintedHtmlPage`, `printedPageAuthorHtml`, `printedPageDirection`, `printedSectionFlows` and the `PrintedHtmlPage` type for them. Imposition (`<segnavia-paper>` and the printable-pages document) refuses a sectioned printed document. A single-page printed document composes exactly as before.
- e5b86f8: Pour record nodes into paginated template sections with record-scoped and
  document-scoped furniture numbering.

  Breaking: replace a record's `name` with `template` and text `values`.
  Templates may declare `slots`; parsing now refuses unknown or unusable record
  templates, incomplete values, non-text slots, parent-page ownership, continuous
  books and keys also claimed by host slots. Add `record.index`, `record.count`,
  `printedPage.documentNumber` and `printedPage.documentTotal` slot paths.
  Paginated books accept titled records wherever they accept flowing sections;
  front- and end-matter records follow the existing optional-title rule.
  Saved plan version 2 carries record and whole-document numbering; recompute
  saved plans made with an earlier version.

- 22c3521: A paginated book section may set `numbering: { counted: false }` or `numbering: { restart: N }`. Plan folios are the single source of page numbers: `Plan.folios` entries are `string | null`, where null marks an uncounted or blank page, and must match `pages` in length. Contents numbers and running folios read them, and the printed PDF carries them as page labels. Section numbering is refused on a continuous book or with a restart beyond the division's number system.
- fefb30e: Allow each paginated book section to select a named paper geometry while keeping one page plan and one PDF. Page composition, screen presentation, saved plans, parent pages, placements, running furniture, folios, destinations and press boxes follow each page's selected trim.
- b44900a: Compose books and printed pages with one measure, plan, and dress runtime. Replace `BOOK_COMPOSER_SCRIPT` and `PRINTED_PAGE_COMPOSER_SCRIPT` with `COMPOSER_SCRIPT` and `composerScript`, and add optional `PaginateBlock.id`, `PaginateBlock.breakBefore` and `PaginateBlock.breakAfter` measurements. A forced page break before or after a block starts a new page in the plan.

### Patch Changes

- Updated dependencies [dc433bb]
- Updated dependencies [2564247]
- Updated dependencies [355e4fb]
- Updated dependencies [ba2b416]
- Updated dependencies [1395b57]
- Updated dependencies [9d16f46]
- Updated dependencies [498edfc]
- Updated dependencies [5a1a73f]
- Updated dependencies [8ae6b29]
- Updated dependencies [e5b86f8]
- Updated dependencies [22c3521]
- Updated dependencies [fefb30e]
- Updated dependencies [b44900a]
  - @segnavia/format@0.51.0

## 0.50.0

### Minor Changes

- 8f84d79: Add universal book and printed-page planning, including capped convergence, and route frame composition through the shared plans.
- 2df0afb: Add saved book pagination through format's `Plan`, `Measurements` and
  `fingerprintValue`, and layout's `BookPlan`, `savePlan` and `replayPlan`.
  `bookPlan` computes the saved plan. `bookPdf` now accepts the `plan` and
  `breaks` options, and `describeDocument` accepts a saved `plan` and describes
  its pages.

  The paginate input types (`PaginateBookInput` and its parts) are now defined by
  format's `Measurements` schema and re-exported by layout as types.

### Patch Changes

- Updated dependencies [6ac32e4]
- Updated dependencies [2df0afb]
  - @segnavia/format@0.50.0

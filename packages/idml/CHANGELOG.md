# @segnavia/idml

## 0.55.0

### Minor Changes

- 49a3ef0: Place parent-page regions on any edge of the page. A parent page declares `regions: { [name]: { edge, html } }`, with `edge` one of `blockStart`, `blockEnd`, `inlineStart` and `inlineEnd`. A region fills the margin band on its edge: block-edge regions are as wide as the text area, and inline-edge regions are as tall as it. The binding and outer edges mirror between recto and verso, and they flip in a right-to-left book. `basedOn` merges regions by name. Layout exports the pure `regionBox`, which the composer and the PDF margin layer both use.

  A book's own parent pages now reach the PDF margin layer, and a continuous book's margin layer follows section and book `parentRules`. Region HTML can be edited through document commands: `setContent` on a parent page's `regions` takes the region name as its key and keeps the region's edge.

  Breaking for hosts:

  - `head` and `foot` are removed from parent pages and are refused with a remedy. Declare `regions: { head: { edge: 'blockStart', html } }` or `regions: { foot: { edge: 'blockEnd', html } }`. The built-in parents declare these two regions.
  - `regions` takes `{ edge, html }` values instead of HTML strings.
  - Composed pages mark each region with `data-segnavia-region` and `data-segnavia-edge`, replacing `data-segnavia-head` and `data-segnavia-foot`.
  - A `setContent` on parent-page `regions` without a key, or with a region name the parent does not declare, is refused.

### Patch Changes

- Updated dependencies [9d871c5]
- Updated dependencies [4467aa3]
- Updated dependencies [49a3ef0]
- Updated dependencies [ade7a55]
  - @segnavia/format@0.55.0
  - @segnavia/html@0.55.0

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

### Patch Changes

- Updated dependencies [24c5777]
- Updated dependencies [c2e0bbb]
- Updated dependencies [a98274d]
- Updated dependencies [9fb55dd]
- Updated dependencies [dd8cf59]
  - @segnavia/format@0.54.0
  - @segnavia/html@0.54.0

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
- Updated dependencies [8f3c1be]
- Updated dependencies [252b705]
- Updated dependencies [6b4d309]
- Updated dependencies [25f56a9]
- Updated dependencies [dfbbb55]
- Updated dependencies [b157cf9]
  - @segnavia/format@0.53.0
  - @segnavia/html@0.53.0

## 0.52.0

### Patch Changes

- Updated dependencies [719d636]
  - @segnavia/format@0.52.0
  - @segnavia/html@0.52.0

## 0.51.0

### Minor Changes

- 498edfc: Declare a document's fonts as a font manifest and report every face that is missing. `StyleSheet.fonts` is now a record keyed by font name: an app font with its `FontDeclaration` faces (`weight`, `style`, `unicodeRange`, `script: 'hebrew'`), or a local font with its fallback. A Hebrew face with no range covers `U+0590-05FF,U+FB1D-FB4F`. A declared face the host does not supply is reported `unsupplied`, and one Chromium does not load is reported `unloaded`; composition continues at the fallback. Render reports through `fontLoad.report({ failures })`, and the page, paper, stage and book elements dispatch `fontfailure`. Add `matchFaces`, `rangeSample`, `fontManifestWithReferences` and `persistedFontManifestWithReferences`. Breaking: the retired `FontReference[]` form of `style.fonts` is refused, and a font the source does not know no longer refuses the render.

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
  - @segnavia/html@0.51.0

## 0.50.0

### Patch Changes

- Updated dependencies [24b0cc8]
- Updated dependencies [8f84d79]
- Updated dependencies [6ac32e4]
- Updated dependencies [2df0afb]
  - @segnavia/html@0.50.0
  - @segnavia/format@0.50.0

## 0.49.0

### Migrating from 0.48

See the `@segnavia/format` 0.49.0 changelog for what to change in stored documents and host calls.

### Minor Changes

- ed3c7cd: Replace package-local paper, margin, size, and direction types with the shared format values.

  Book and parent-page content margins now require all four logical edges and refuse legacy physical or inner/outer names.

  Print margins are binding-relative, so right-to-left single-page printing mirrors the inline edges.

  Raster media intrinsic sizes now require whole pixels, while vector and document media sizes remain point-valued and may be fractional.

  The IDML package no longer exports `IdmlMargin`; IDML page margins use the shared `PhysicalMargin` type, in points.

- e126784: Mint required node and content-block ids through a host-supplied `newId` seam, preserve existing ids, and refuse duplicates across one document.

### Patch Changes

- Updated dependencies [ea9421b]
- Updated dependencies [ed3c7cd]
- Updated dependencies [53afd24]
- Updated dependencies [7c5952b]
- Updated dependencies [e126784]
- Updated dependencies [ea9421b]
- Updated dependencies [ea9421b]
- Updated dependencies [b3f94ac]
- Updated dependencies [ea9421b]
- Updated dependencies [f36066e]
- Updated dependencies [860d9d3]
- Updated dependencies [ea9421b]
  - @segnavia/format@0.49.0
  - @segnavia/html@0.49.0

## 0.48.0

### Patch Changes

- Updated dependencies [ed0f315]
- Updated dependencies [e25fc69]
  - @segnavia/format@0.48.0
  - @segnavia/html@0.48.0

## 0.47.0

### Patch Changes

- Updated dependencies [6ef773e]
- Updated dependencies [b9754e3]
- Updated dependencies [1b85f5e]
  - @segnavia/format@0.47.0
  - @segnavia/html@0.47.0

## 0.46.0

### Patch Changes

- @segnavia/format@0.46.0
- @segnavia/html@0.46.0

## 0.45.0

### Patch Changes

- @segnavia/format@0.45.0
- @segnavia/html@0.45.0

## 0.44.0

### Minor Changes

- 9a9988e: Add `inspectIdml` and answer-driven IDML part mapping. Imports whose source offers ambiguous structure now refuse with the open question and its candidate labels; inspect the file, choose from its previews, and pass the choice through `answers` to clear the refusal.

### Patch Changes

- Updated dependencies [39b04fb]
- Updated dependencies [2bfaeb2]
- Updated dependencies [ab876ef]
- Updated dependencies [4111b91]
- Updated dependencies [5a64fcc]
- Updated dependencies [1e4aada]
- Updated dependencies [70ceccb]
  - @segnavia/format@0.44.0
  - @segnavia/html@0.44.0

## 0.43.0

### Patch Changes

- Updated dependencies [817cfb2]
- Updated dependencies [4f77670]
  - @segnavia/html@0.43.0
  - @segnavia/format@0.43.0

## 0.42.0

### Patch Changes

- @segnavia/format@0.42.0
- @segnavia/html@0.42.0

## 0.41.0

### Patch Changes

- @segnavia/format@0.41.0
- @segnavia/html@0.41.0

## 0.40.1

### Patch Changes

- Publish every package at one version. The 0.40.0 publish stopped partway: `@segnavia/render` and `@segnavia/capture` 0.40.0 were never published. 0.40.1 has the same code as 0.40.0. Use 0.40.1 in place of 0.40.0.
- Updated dependencies
  - @segnavia/format@0.40.1
  - @segnavia/html@0.40.1

## 0.40.0

### Patch Changes

- Updated dependencies [636664c]
- Updated dependencies [e008df9]
- Updated dependencies [12c57ab]
- Updated dependencies [528b896]
  - @segnavia/format@0.40.0
  - @segnavia/html@0.40.0

## 0.39.0

### Minor Changes

- 8a73551: IDML imports preserve tables as native HTML tables, including their grid structure, repeating row regions, spans, direction, and layered table and cell styles.
- 9f1b83f: Hosts can use one asset resolver to place media in books, decks, and boards across browser and server output. Slot, board, and IDML adapters accept the same placement model.

### Patch Changes

- Updated dependencies [d36e171]
- Updated dependencies [35024b0]
- Updated dependencies [f8ab208]
- Updated dependencies [9f1b83f]
- Updated dependencies [2341d56]
- Updated dependencies [0979253]
- Updated dependencies [dd46281]
  - @segnavia/format@0.39.0
  - @segnavia/html@0.39.0

## 0.38.0

### Patch Changes

- Updated dependencies [b8569dc]
- Updated dependencies [afb281b]
- Updated dependencies
- Updated dependencies [fdd794a]
- Updated dependencies [3d703f5]
- Updated dependencies [c3c0505]
- Updated dependencies [4824f85]
- Updated dependencies [e44df2c]
  - @segnavia/format@0.38.0
  - @segnavia/html@0.38.0

## 0.37.0

### Patch Changes

- Updated dependencies [b8c262d]
- Updated dependencies [bf40e80]
  - @segnavia/format@0.37.0
  - @segnavia/html@0.37.0

## 0.36.0

### Patch Changes

- @segnavia/format@0.36.0
- @segnavia/html@0.36.0

## 0.35.0

### Patch Changes

- @segnavia/format@0.35.0
- @segnavia/html@0.35.0

## 0.34.0

### Minor Changes

- 7e2f884: Compose inherited master-page furniture into imported heads and feet.
- 0bd398a: Render IDML paragraph shading colors, tints, offsets, and rounded corners.
- 8e42c2c: Render inline anchored text frames in their host stories and keep anchored-only stories out of the chapter list.

### Patch Changes

- 2710068: Derive recto-only chapter openings from the pages where imported chapters begin.
  - @segnavia/format@0.34.0
  - @segnavia/html@0.34.0

## 0.33.0

### Patch Changes

- @segnavia/format@0.33.0
- @segnavia/html@0.33.0

## 0.32.0

### Minor Changes

- 7e2829c: Import opener title blocks from polygon art, separate header stories, and host-mapped linked SVG assets.
- d58171d: Map IDML font families and faces through a synchronous host seam into Book font references and CSS.

### Patch Changes

- @segnavia/format@0.32.0
- @segnavia/html@0.32.0

## 0.31.0

### Patch Changes

- @segnavia/format@0.31.0
- @segnavia/html@0.31.0

## 0.30.0

### Minor Changes

- 9c7de65: Map applied IDML master spreads to Book parent pages with running marks and folios.

### Patch Changes

- Updated dependencies [0246112]
- Updated dependencies [677a43a]
  - @segnavia/html@0.30.0
  - @segnavia/format@0.30.0

## 0.29.0

### Minor Changes

- 0e118dc: Import story text, paragraph and character styles, columns, direction, language, and keep settings into validated books.

### Patch Changes

- @segnavia/format@0.29.0
- @segnavia/html@0.29.0

## 0.28.0

### Minor Changes

- 650da8f: Read an IDML package into a Book with document setup and one placeholder chapter per story, plus an import report.

### Patch Changes

- Updated dependencies [48493cf]
- Updated dependencies [7a398eb]
- Updated dependencies [492e956]
- Updated dependencies [e6ebbd7]
- Updated dependencies [ab06b35]
- Updated dependencies [52ba024]
- Updated dependencies [ca43ac9]
- Updated dependencies [a9b9c57]
- Updated dependencies [f491698]
  - @segnavia/format@0.28.0
  - @segnavia/html@0.28.0

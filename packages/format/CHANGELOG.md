# @segnavia/format

## 0.53.0

### Minor Changes

- 370e995: Let slot values and the Fields panel use per-design overrides ahead of shared fills.
- b44a38d: Expose structured measure, limit and actual values when a host limit refuses format, frame or render output.
- d90ef76: Accept the stored `CoverInput` in `coverDigest`, matching the renderer's
  `coverImage` input. This breaking 0.x change refuses a parsed `Cover` in
  `coverDigest`; holders of one can pass `coverDigestMaterial(cover, options)` to
  `digestCoverMaterial`.
- 30bd6b7: Let documents declare the calendar day their data is for and resolve its time zone in one place.
- b5cde83: Allow multi-word lexicon terms while preserving script captions, and let ElevenLabs dictionary publishing safely control case sensitivity and cancellation.
- 7f5ed55: Export font manifest reference helpers and accept references, an optional font manifest or no fonts when reading or packing local fonts.
- 41c3b46: Change the default note-symbol sequence to `* § ‖ ¶`. This is a breaking
  0.x change for books that use `marker: 'symbols'`; restore dagger marks with
  `marker: { symbols: ['*', '†', '‡', '§'] }`.

  A note series may now provide its own repeating `{ symbols: [...] }` sequence
  or use `{ mark: '⁂' }` to give every note the same fixed, unnumbered mark.
  Used series are refused when their repeated marks can overlap, including when
  a symbol-like mark uses only the characters of a used number system.

- 1bd389b: Expose board-node movement, label resizing, and node marquee geometry for browser and server callers.
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

- 6b4d309: Resolve a document's as-of day once for page and document previews, browser printing, and page rendering; pass it to host content seams; and expose it to bindings, reports, and element events.
- dfbbb55: Let `deckFromSlides` carry a style sheet into the deck document it builds.
- b157cf9: Give board labels an authored wrap width, width-aware measurement, and logical resize anchoring.

### Patch Changes

- 56bb43a: Include each package's changelog in its published tarball.
- 358b110: Paginated books now honor keeps on nested blocks. A list item or other
  block inside a container that sets `break-inside: avoid` is no longer split
  across pages. A nested heading or speaker kept with the next element moves
  with the block that follows its container instead of ending a page alone.
- 25f56a9: Show every reported slot state in the item settings Fields panel.

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

## 0.51.0

### Minor Changes

- dc433bb: Allow author scripts, styles, fonts and images through one kind-aware origin policy in live frames and offline rendering. Google Fonts and pinned script CDNs are approved by default; hosts add `{ origin, kinds }` entries with `origins`.

  Breaking: replace `dependencyOrigins: [origin]` with `origins: [{ origin, kinds: ['script', 'style', 'font'] }]`, and replace the render `dependencies(url)` cache with `assets(url, { kind, signal })`. Rendered assets default to 50 MiB per document and 10 MiB each through host-only `limits.assets`.

  A remote image in converted Markdown is kept only when its image origin is approved by `origins`; converter protocol allowances no longer bypass the origin policy.

  Cover-image rendering forwards `origins` and `assets`. Page thumbnails, live composed-page views, and both composed-page print frames carry `origins` into their author-frame CSP.

  Refused-script frames inherit `manifest-src 'none'`, `prefetch-src 'none'` and `child-src 'none'` from `default-src 'none'`.

  `srcset` candidates follow the same origin policy as `img src`.

- 2564247: Use `DocumentOp` and `DocumentBatch` as the board operation model, with rebased
  per-writer undo and remote edits through `BoardEditing.applyRemote`.

  `editBoard` now takes a parsed board `Document` and returns the edited
  `document` with its `batch`. `BoardEditing.apply` and `applyRemote` refuse a
  conflicting batch whole and direct the host to rebuild it against the current
  board.

  This removes `BoardOp`, `applyBoardOps`, `invertBoardOps`, `diffBoards`,
  `SectionFields`, and `jsonSchemas().boardOp`.

- 355e4fb: Name a brand from any document and resolve it through the host.

  A deck, book, printed page, page or board may set `brand` to a name. The host
  keeps the brand and supplies it through `BrandSource`: the `brands` property on
  `<segnavia-page>`, `<segnavia-paper>`, `<segnavia-board>`, `<segnavia-stage>`
  and `DeckController`, and the `brandSource` option on the render entry points.
  The resolved brand is layered under the document's own style. A board's brand
  is the default for each item that names none, and an item's own brand replaces
  it whole. A brand the host does not supply, or one that is not a valid style
  sheet, is refused, naming the brand; nothing renders unbranded. A host that
  lowers a document by itself calls `resolveBrand` first.

  `exportDesignTokens` and `importDesignTokens` move a brand's color, dimension
  and font-family tokens to and from the W3C design-tokens format.
  `brandSpecimen` builds a book showing a brand in English or Hebrew.

  `StyleSheet` now refuses an unknown key at every level, naming its path. Remove
  any stray keys from stored style sheets before upgrading.

- ba2b416: A book section may set `contentsLabel` and `subtitle`. The label replaces the section title in the contents entry and the PDF bookmark, and the subtitle sits beneath the contents entry. Each takes its own text's direction first through `entryDirection`. An empty label or subtitle is refused. A placed section now keeps every section field when it resolves.
- 1395b57: A book section may set `opens: 'continue'` to join the preceding flowing section's flow without a page break, keeping its own contents entry, outline node, heading destination and running-head title. `BookOpens` gains `continue`, while a part's `opens` stays `recto`, `verso` or `any`. `continue` is refused on the first section of a division or part, on or after a non-flowing section, and together with section `numbering` or `parents`. Recto planning skips a continuing section. A page mark whose element sets `data-mark-scope="flow"` is not carried into a later section's flow, and `PaginateMark` and `PaginatePageMarks` carry that optional `scope`. The `title` running-head source shows the first section title on the page.
- 9d16f46: Take a page Document as the designed-cover input and refuse the legacy Page shape. Put the cover print setting on the Document root; a print setting on the page node is not read. The cover page body must contain stored HTML, so pass a markdown Document through `@segnavia/html`'s `parseDocument` first. Parsed covers still expose the lowered Page value to render and frame consumers.
- 498edfc: Declare a document's fonts as a font manifest and report every face that is missing. `StyleSheet.fonts` is now a record keyed by font name: an app font with its `FontDeclaration` faces (`weight`, `style`, `unicodeRange`, `script: 'hebrew'`), or a local font with its fallback. A Hebrew face with no range covers `U+0590-05FF,U+FB1D-FB4F`. A declared face the host does not supply is reported `unsupplied`, and one Chromium does not load is reported `unloaded`; composition continues at the fallback. Render reports through `fontLoad.report({ failures })`, and the page, paper, stage and book elements dispatch `fontfailure`. Add `matchFaces`, `rangeSample`, `fontManifestWithReferences` and `persistedFontManifestWithReferences`. Breaking: the retired `FontReference[]` form of `style.fonts` is refused, and a font the source does not know no longer refuses the render.
- 5a1a73f: Put press fields in a printable Document's `print` setting for decks, books and printed pages. Their PDFs now write trim and bleed boxes and crop marks on every page, and deck notes sheets take press fields from the deck's `print`.

  Imposition no longer accepts `bleed` or `safe`, and `notesPaper` no longer accepts press fields. Pieces on one imposition must have the same `print.bleed` and `print.safe`; composition refuses the first piece that differs. Invalid paper fields on deck and book `print` values, removed imposition fields, removed `PrintOptions.sheet`, and press fields on `notesPaper` are refused with their replacement settings.

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

## 0.50.0

### Minor Changes

- 6ac32e4: Compile document style sheets into isolated CSS cascade layers in every frame.

  This is a breaking document-format change. `style` is now a `StyleSheet`.
  Book `css` moves to `style.css`, and book and page font references move to
  `style.fonts`; decks use the same font location. Books and printed pages accept
  all style sections, pages omit `pageGeometries`, decks accept `tokens`,
  `textStyles`, `fonts` and `css`, and boards accept no style sections.

  The former `bookStylesheet` helper is removed; compile `style` with
  `compileStyleSheet` and pass its separate sheets to the frame instead.

  A style sheet that cannot merge (an unknown `basedOn` or token, a cycle, or a
  chain deeper than 8) is refused with `StyleSheetRefusedError` from
  `@segnavia/frame/bridge`, and with `RenderRefusedError` from render.
  `frameDocument` without `sheets` emits the compiled base layer.

- 2df0afb: Add saved book pagination through format's `Plan`, `Measurements` and
  `fingerprintValue`, and layout's `BookPlan`, `savePlan` and `replayPlan`.
  `bookPlan` computes the saved plan. `bookPdf` now accepts the `plan` and
  `breaks` options, and `describeDocument` accepts a saved `plan` and describes
  its pages.

  The paginate input types (`PaginateBookInput` and its parts) are now defined by
  format's `Measurements` schema and re-exported by layout as types.

## 0.49.0

### Migrating from 0.48

0.49.0 is a clean break. Stored documents and host calls are not upgraded at parse time, so update them before moving to 0.49.0:

- **Document input:** every viewing, printing and rendering entry point takes one `Document`, `{ type: 'document', kind, ... }`, with `kind` set to `deck`, `page`, `printed`, `book` or `board`. The `Deck`, `Page`, `Book`, `printedPages` and board input shapes, their type exports and their JSON Schemas are removed, and `jsonSchemas().document` is the host schema. "Document input and migration" in the repository's `docs/architecture.md` maps every legacy field to its place in a `Document`.
- **Resolvers, events and builders:** placement resolvers return a page or printed `Document` in a page answer. Board item resolvers return deck and page `Document` payloads, and paper item resolvers return page or printed `Document` payloads. `<segnavia-board>`'s `board` property, its change and share events and its editing callback carry the board `Document`. `deckFromSlides` returns a deck `Document` and takes `{ settings: { scripts, dir, lang }, data: { slots } }`. A board item's legacy `kind: 'image'` is no longer read as `media`; write `kind: 'media'`.
- **Ids:** `Document.parse` and `parseDocument` keep every supplied node and block id and mint missing ones through the `newId` option (by default `crypto.randomUUID()`). Pass a deterministic `newId` for reproducible output, and store the returned `Document` to keep its ids. Duplicate ids are refused.
- **Board inversion:** `invertOps` now inverts document operations; board operations are inverted by `invertBoardOps`.
- **Book and parent-page margins:** replace `{ top, bottom, inner, outer }` with `{ blockStart, blockEnd, inlineStart, inlineEnd }`. All four are required. `inlineStart` is the binding edge and `inlineEnd` the outer edge. Physical or inner/outer names are refused.
- **Print margins:** replace the physical `{ top, right, bottom, left }` (`Margin`) with the same binding-relative `LogicalMargin`. On a right-to-left single page, the inline edges now mirror.
- **Sizes:** `Size` is now `PixelSize` (an authored canvas in whole pixels) or `MeasuredSize` (a measured box, which may be fractional). Paper sizes state their unit (`mm`, `in` or `pt`), and vector media use `PointSize`.
- **IDML:** `IdmlMargin` is removed; use `PhysicalMargin`, in points.
- **Limits:** pass one `limits` value to every render and print call:
  - `maxSheets` becomes `limits.sheets` and `maxBytes` becomes `limits.bytes`.
  - On decks, `maxSlides`, `maxSlideBytes` and `maxNotesBytes` become `limits.slides`, `limits.slideBytes` and `limits.notesBytes`.
  - `localFonts.limits` becomes `limits.localFonts`.
  - A removed key is refused with its replacement named, and an unknown key is refused with an instruction to remove it.
  - `RenderLimits`, `DeckLimits`, `LocalFontLimits`, `LOCAL_FONT_LIMITS` and `PRINTED_PAGE_LIMIT` are no longer exported; use `Limits`, `DEFAULT_LIMITS` and `resolveLimits`.
- **Page limit:** a document with printed pages, or a paginated book, may declare `limits.pages`. It defaults to 500, and a host's `limits.pages` is a ceiling over it. Refusals for every limit now share one text.

### Minor Changes

- ea9421b: Pass `{ type: 'document', kind: 'deck', ... }` for decks and `{ type: 'document', kind: 'page', ... }` for screen pages. Deck and page entry points no longer accept the old `Deck` and `Page` input shapes, and `deckFromSlides` now returns a deck `Document`.
- ed3c7cd: Replace package-local paper, margin, size, and direction types with the shared format values.

  Book and parent-page content margins now require all four logical edges and refuse legacy physical or inner/outer names.

  Print margins are binding-relative, so right-to-left single-page printing mirrors the inline edges.

  Raster media intrinsic sizes now require whole pixels, while vector and document media sizes remain point-valued and may be fractional.

  The IDML package no longer exports `IdmlMargin`; IDML page margins use the shared `PhysicalMargin` type, in points.

- 53afd24: Add atomic agent-facing document commands, plain JSON document descriptions, and a configurable concise-description text bound. Description plan and report sections arrive with the saved `Plan` and the layout `Report`.
- 7c5952b: Add the shared `Numbering` value, `computeFolios`, and `sequenceFolios`, including restarts and uncounted pages.

  Compute book, printed-page, deck, and rendered PDF folios through the shared function without changing their rendered numbering.

- e126784: Mint required node and content-block ids through a host-supplied `newId` seam, preserve existing ids, and refuse duplicates across one document.
- ea9421b: Remove the legacy deck, page, book, and board input type exports and their generated JSON Schemas. Pass a `Document` instead; see “Document input and migration” in `docs/architecture.md` for every field mapping.
- ea9421b: Add the unified `Document` structure schema, kind profiles, generated exported-schema manifest, and pure lowerings to the existing per-kind parsed values.
- b3f94ac: Add atomic, fingerprinted `DocumentOp` batches with apply, inversion, and document diff helpers. `jsonSchemas()` publishes `documentOp` and `documentBatch`. Board inversion is now exported as `invertBoardOps` so `invertOps` names document inversion.
- f36066e: Add the document block view and block operations. `blockView` lists every block in document order with its id, kind, text, class, attributes, content address and enclosing block. `insertBlock`, `setBlock`, `moveBlock` and `removeBlock` compile an edit to `setContent` operations with priors, so `applyOps` checks staleness and `inverseBatch` undoes it. They take `BlockOpOptions` with the host's `newId`. A block may stand only where its kind and its parent allow, and every fragment an operation writes must re-parse to itself. Block operations do not sanitize; speaker notes are plain text and hold no blocks.

  `@segnavia/format` now exports `DOCUMENT_NODE_MODEL`, `documentEntries` and `requireParsedDocument`, so other packages read the document model rather than copying it.

- 860d9d3: Replace the separate page, deck, render, image and local-font ceilings with one format-owned `Limits` value.

  Resolve document page declarations against host ceilings and use one refusal text at every enforcement site.

  Render hosts rename `maxSheets` to `sheets` and `maxBytes` to `bytes`; deck hosts rename `maxSlides` to `slides`, `maxSlideBytes` to `slideBytes` and `maxNotesBytes` to `notesBytes`. Local-font count and byte ceilings move from `localFonts.limits` to `limits.localFonts`. Capture keeps its own `output.maxBytes` option and maps it to `limits.bytes`.

- ea9421b: Pass `{ type: 'document', kind: 'board', ... }` to `<segnavia-board>`. Its `board` property, change and share events, and editing callback now carry the board `Document`; `documentFromBoard` raises internal board edits without dropping the source document's root fields.

  Board item resolvers now return deck and page `Document` payloads, and paper item resolvers return page or printed `Document` payloads.

## 0.48.0

### Minor Changes

- ed0f315: Make printed-page composition independent of the host window and share the paper viewport calculation across browser and server printing.
- e25fc69: Add shared document metadata for printed-page previews and PDFs.

## 0.47.0

### Minor Changes

- 6ef773e: Keep small printed structures together by default and allow content CSS to control fragmentation explicitly.

## 0.46.0

## 0.45.0

## 0.44.0

### Minor Changes

- 39b04fb: Add a pure structural board description for agents, including filtering, paging, geometry, and shape-confidence details.
- 2bfaeb2: Add pure `BoardCommand` item editing, `BoardTarget`, and atomic `editBoard` batches with diffs, resolved geometry changes, adjustments, and refusals.
- ab876ef: Add granular, invertible board operations. `BoardOp` is a Zod schema published as `jsonSchemas().boardOp`; `applyBoardOps` refuses malformed or stale operations, `diffBoards` computes the operations between two boards, and `invertOps` reverses them. `Board.parse` now keeps the first occurrence of a section member listed more than once, instead of accepting the repeat.
- 1e4aada: Edit board sections, labels, titles, and text direction through board commands.
- 70ceccb: Add optional measured sizes to `BoardLabel` and export `boardShapes`, `BoardItemFact`, `labelShape`, `provisionalShape`, and `resolvedShape` from format.

  Boards whose items reuse one address for different asset kinds are now refused; hosts with such stored boards must give each kind its own address.

  The public `resolvedShape` export from frame now takes a `BoardItemFact` instead of a `ResolvedBoardItem`; callers must pass the format shape fact.

## 0.43.0

### Patch Changes

- 4f77670: Declare Bun 1.4.2 or later as a supported runtime.

## 0.42.0

## 0.41.0

## 0.40.1

### Patch Changes

- Publish every package at one version. The 0.40.0 publish stopped partway: `@segnavia/render` and `@segnavia/capture` 0.40.0 were never published. 0.40.1 has the same code as 0.40.0. Use 0.40.1 in place of 0.40.0.

## 0.40.0

### Minor Changes

- 636664c: Add full, standard, wide and numeric widths for flowing pages, with shared host overrides across browser and server surfaces.

  The `FLUID_WIDTH` format export is removed. Use `PAGE_WIDTHS` or `resolvePageWidth` instead.

  Legacy `fluid` page data now parses as `{ width: 'full', height: 'auto' }`. Existing cover digests therefore change once, so hosts should expect to redraw cached cover images once. Re-serializing a parsed legacy page writes the new shape, which older library versions cannot read.

- 12c57ab: Add HTML or markdown page bodies, sanitized markdown conversion, outlines, and the reader geometry for wide markdown content.

  A page re-serialized by this version cannot be read by an older library because its content is stored under `body`. Cover digests change, so hosts should redraw kept cover images.

## 0.39.0

### Minor Changes

- d36e171: Hosts can model media assets and contextual placements and detect placement cycles.

  The imposition type `Placement` is now `ImpositionPlacement`.

- 35024b0: Hosts can give decks designed covers, use stable cover picture digests, and render cover images offline at an exact thumbnail width. A cover takes any sheet its print setting describes, and 160 × 100 mm when it has none. Boards and thumbnails display designed covers. Page images with a print setting are drawn at the sheet size and no longer grow to their content height.
- 9f1b83f: Hosts can use one asset resolver to place media in books, decks, and boards across browser and server output. Slot, board, and IDML adapters accept the same placement model.
- 2341d56: Read a named face from a TrueType or OpenType collection. Collection faces are selected by PostScript name and extracted to standalone font bytes before browser or PDF loading.
- 0979253: Resolve placed media in page and book HTML through one host seam: an `img` with `data-segnavia-media` is resolved through the `placements: { resolve, report? }` option on page, paper, document, book, thumbnail and board elements, browser `printPages` and the page and book render options. `@segnavia/format` exports `FLUID_WIDTH`, the viewport width of a fluid page.

### Patch Changes

- dd46281: Stack several page-placed note series at the foot of a paginated book page. Each used series forms a declaration-ordered group with its own measured top gap, numbering and marker, and continued notes remain in their series group on later pages.

## 0.38.0

### Minor Changes

- b8569dc: Add recursive named parts and front, body and end divisions to books, including structural contents, outlines and part running heads. A parsed `Book` carries its body as `body`; `chapters` is still accepted as input, but a host that read `book.chapters` after parsing reads `book.body` or `bookSections(book)` instead. Parts nest at most six deep, and a part with neither an opening nor a section inside it is refused.
- afb281b: Fit a template region's text to its box. A `[data-region]` element may declare `data-fit-min` and `data-fit-step` as absolute CSS lengths. Its authored font size is the maximum, and the paginated composer steps the size down until the region's text fits, on screen and in the PDF alike. Text still overflowing at the minimum goes into the overflow report. A minimum above the authored size is reported as its own overflow entry. An invalid, non-positive or non-absolute value in template or region HTML is refused at build.
- Model a book's notes as named series. A book declares them with `notes: [{ name, placement: page|chapter|part|book, numbering: chapter|part|book, marker, title }]`; `footnotes` and `endnotes` configure the two default series. A repeated call `<a data-note-ref>` keeps the first number. Chapter-placed endnote sections gain a scope subheading, `p.segnavia-notes-scope`.
- fdd794a: A paginated page's text area now follows its parent page's margins.

  - **Per page:** text height follows each page's parent. The text box, columns, windows and furniture strips are sized from the parent page, on screen and in the PDF.
  - **Per flow:** a flowing section's opener, recto and verso parents must leave one text width. A mismatch is refused at print and at IDML import, naming the parents and both widths.
  - **Galley image cap:** the shortest of the flow's parent text heights.
  - **Opener refusal:** a section's first content that does not fit its opener is refused, naming the opener parent.
  - **Margins:** every resolved parent page must leave a positive text area.
  - **Window edges:** cloned window edges keep the galley's pixel phase, so pointed Hebrew marks are not clipped.

- c3c0505: Add book authors and subjects, and preserve PDF metadata and outline destinations across continuous and paginated book rendering.
- 4824f85: Store artifact-style HTML unchanged as a scripted page. Hosts can set `dependencyOrigins` for scripts, styles and fonts and supply the render-time `dependencies` cache seam. Static markup and render requests to known package CDNs require exact versions; the viewer CSP is origin-granular, so runtime imports at an approved origin are not version-pinned. Scripted frames add `allow-forms` under `form-action 'none'` so submit handlers run without allowing a real submission, and never add `allow-same-origin`. Scripted viewers now refuse remote images and connections through a tighter CSP.
- e44df2c: Share one 64-face, 32 MiB local-font transport bound between browser packing and server rendering.

## 0.37.0

### Minor Changes

- b8c262d: `@segnavia/format` lets a paginated book view carry its continuous HTML build.
  `@segnavia/html` adds named print, galley and flow document builds with responsive columns, scaled held pages, continuous notes and shared position keys.

## 0.36.0

## 0.35.0

## 0.34.0

## 0.33.0

## 0.32.0

## 0.31.0

## 0.30.0

### Patch Changes

- 677a43a: Accept a variable font's weight range on a host-supplied face. Refuse `bolder` and `lighter` as face weights.

## 0.29.0

## 0.28.0

### Minor Changes

- 48493cf: Carry a sanitized `Book.css` stylesheet after generated font CSS and before host render CSS in every book view and PDF.
- 492e956: Place designed pages and per-section parent pages in a paginated book.
- ab06b35: Print a paginated book from Chromium's line boxes, with footnotes, column runs, marks and running heads.
- ca43ac9: Place any named page mark in a paginated book's parent-page head or foot with `data-motif="segnavia:mark"`, `data-motif-name` and optional `data-motif-which`.
- f491698: Fill templated pages, report overfull regions and apply host slot values in a paginated book.

## 0.27.0

### Minor Changes

- add7c29: Print pages with parent-page furniture from the browser, using the same composed papers and identity-imposition policy as server PDF rendering.
- be667fe: Add motif definitions, version selection, host source types, expansion, save-time placement refusals, and consistent page viewing, image and PDF wiring.
- eadae7c: Move book folios and running heads onto default parent pages backed by reserved library motifs.
- f98d1bd: Package a page's named local font faces as JSON-safe transport and accept them for one server render alongside the FontSource that establishes each local reference's app-font fallback. Validate signatures and host-set limits, embed only requested families, report missing local faces, and retain no decoded face after the call.
- efb84cb: Let a page and a motif name app and local fonts. The host supplies app faces through FontSource; a browser helper reads local fonts. Preview, print and server PDF embed the same data: faces for app fonts. A server PDF shows the declared fallback for a local font until server local fonts exist.
- bc3b86c: Add inherited parent pages, printed-page roles and numbered head and foot motifs to server-rendered flowing pages.

## 0.26.0

### Minor Changes

- 31831c0: Add folded impositions with half, letter, Z, gate and custom presets, panel page maps, and dashed fold marks on imposed PDFs.
- 84522f0: Add a markColor option so crop marks can draw in registration color on single pages and imposed papers.

## 0.25.0

### Patch Changes

- 8aa5beb: Export schemas for slot keys, slot values, and fill value records.

## 0.24.0

### Minor Changes

- 7ae70b2: Add bleed-safe crop marks, optional gap corner marks, and omitted-mark reporting to imposed PDF papers.

### Patch Changes

- 7f23541: Anchor press layouts to an exact physical root on screen and in print, independent of Chromium's rounded viewport.

## 0.23.0

### Minor Changes

- b8d700b: Add measured per-slot overflow policies and refuse printing when configured text does not fit.
- 2826705: Add host data sources as a second slot fill layer with per-value hand overrides.
- 20456e8: Add QR slots, refuse print and server output with unfilled required slots, and collapse unfilled optional slot elements.

## 0.22.0

### Minor Changes

- 20cdad3: Declare reusable item slots and fill them consistently in viewers, thumbnails, browser print, and server renders.

## 0.21.0

### Minor Changes

- 2c84e8c: Add optional page identities and a document authoring rail with optimistic drag and keyboard reordering.
- 77ae491: Add translatable named-paper metadata, bounded custom paper validation, stored print-setting schemas, and a paper picker with a React wrapper.

## 0.20.0

## 0.19.0

## 0.18.0

### Minor Changes

- 3dfbd5a: Add common online-printer trim sizes as named papers.
- 02c3457: Let each slide choose the frozen animation moment used by browser and PDF deck printing, and let scripted slides hold readiness while drawing that moment.

## 0.17.0

### Minor Changes

- ed1d7f1: Rename `step` playback to `segmented`; `step` still parses. Show the deck's time in both playback modes, hide Play on a deck nothing can play, hide host actions while presenting, keep the stage shadow inside the player, fade the rail's scrolled edges, use the closed-caption icon, and label the notes field "Notes".

## 0.16.0

### Minor Changes

- 3c52b32: Lay out auto-managed board sections as explicit grids and edit their cell placements.

## 0.15.0

## 0.14.0

### Minor Changes

- aea4e97: Fit board sections to their members across membership changes, preserve membership within the starting box, show drop targets, and move overlapping items, sections and labels clear as one undoable edit.

## 0.13.0

### Minor Changes

- c70aceb: Add immutable board move, resize, removal and insertion edits.

## 0.12.0

## 0.11.0

### Minor Changes

- 88a3de9: Add board listing policy, host-provided item names and content search, reveal geometry, and the headless `<segnavia-board-list>` element.

## 0.10.0

### Minor Changes

- ca26399: Add the Board value and pure placement geometry for bounds, view transforms,
  visibility, hit-testing and automatic arrangement.

## 0.9.1

## 0.9.0

### Minor Changes

- 82b0071: Add opt-in responsive decks whose screen canvases reflow at the stage box size while rail thumbnails and print remain fixed.

## 0.8.0

### Minor Changes

- 20bd5e6: Add a deck-level framed-image option with per-slide overrides for images and shots.

  Give slide canvases in the styled player a white, host-customizable backdrop while keeping headless stages transparent.

- 591c819: `@segnavia/format` adds deck and slide fit options for image and shot content.

  `@segnavia/frame` applies shared fit geometry to the stage, rail and print output.

## 0.7.0

### Minor Changes

- ### `@segnavia/format`

  - Add the validated `BookView` interchange shape and JSON Schema.

  ### `@segnavia/html`

  - Keeps the HTML package aligned with the shared 0.7.0 package release; it has no package-specific API changes.

  ### `@segnavia/frame`

  - Add the continuous-book frame element for host-built book views.
  - Handles links to in-page targets inside a library frame without navigating the frame away. Links to missing targets leave the frame in place.

  ### `@segnavia/react`

  - First release published to npm: typed React components for the player and controls, with `useDeckController` and `useAuthoring`

  ### `@segnavia/render`

  - Keep overflowing multi-page, growing, fluid and book prints at true size and report their clipped content.

  ### `@segnavia/capture`

  - Keeps the capture package aligned with the shared 0.7.0 package release; it has no package-specific API changes.

  ### `@segnavia/voice`

  - Keeps the voice package aligned with the shared 0.7.0 package release; it has no package-specific API changes.

## 0.6.0

## 0.5.0

### Minor Changes

- ### `@segnavia/format`

  - Adds `deckFromSlides(slides, options)`, which turns generic slide rows (HTML or shot, with optional notes, narration and timing) into a validated `Deck`. `omitNotes` drops notes for public use.
  - Adds contents placement, depth, endnotes titles, and recto-opening control to the book format.

  ### `@segnavia/html`

  - Transforms books into ordered HTML sections with generated contents and notes.

  ### `@segnavia/frame`

  - Adds `<segnavia-rail>`, a lazy thumbnail strip, and the player's `rail` attribute. The rail sits at the inline start of the slide (left in left-to-right decks, right in right-to-left ones) and moves below the bar on narrow screens.
  - Adds the opt-in authoring entry `@segnavia/frame/authoring`. `attachAuthoring(player, handlers, options?)` offers reorder (`moveSlide`) and notes (`saveNotes`) only for the handlers a host passes. The library holds the optimistic state, rollback, autosave, and dirty and error events; the host owns every write.
  - While notes have focus, slide scripts are paused so a slide cannot take the editor's keystrokes.
  - Exports the canonical element-name maps.
  - Behavior change: a player in normal page flow now sizes its slide from its width, like a video. A host that gives the player a definite height and wants the slide fitted to it sets `fit="height"`.

  ### `@segnavia/react`

  - New package: typed React components for the player, stage and every control, with `useDeckController` and `useAuthoring`. React and React DOM are peer dependencies of this package only.
  - The package is not yet published to npm.

  ### `@segnavia/render`

  - Prints near-neutral colors with black ink alone within a configurable press tolerance.

## 0.4.0

### Minor Changes

- ### `@segnavia/format`

  - Adds language-aware long-document schemas and validation, including the `Book` value.
  - Adds Arabic, Roman, Hebrew and symbol numbering helpers.
  - Adds portable pronunciation lexicons.

  ### `@segnavia/html`

  - Keeps the HTML package aligned with the shared 0.4.0 package release; it has no package-specific API changes.

  ### `@segnavia/frame`

  - The finished player gains a configurable two-row control bar. The track is on top. Below it come the time, then previous, play and next centered, then the host's actions, mute, captions, notes and presentation.
  - Adds the styled controls `<segnavia-time>`, `<segnavia-mute>` and `<segnavia-captions>`.
  - In continuous playback the track is one seekable timeline. Each slide gets a share proportional to its length, with visible breaks between slides. It can be clicked, dragged or used as a slider from the keyboard.
  - Adds the player attributes `playback`, `captions` and `presentation` (`window`, `native` or `off`). They are observed whenever they are set.
  - Adds the `actions` and `below` slots for host content, and exported parts for every control and caption word state (`word-current`, `word-spoken`).
  - Presentation switches the player to its dark color scheme.
  - The controls use Lucide icons, copied in, with their ISC license in `THIRD-PARTY-NOTICES`; there is no new dependency.
    - The optional entry `@segnavia/frame/icons` exports them for headless hosts, and the headless entry does not include them.
    - Every icon can be replaced through a named slot (`icon-play`, `icon-mute`, ...).
  - `PlayerLabels` gains keys for the new controls. A partial labels object falls back to English for any missing key.
  - Behavior change: `<segnavia-fullscreen>` and the player now present in the window by default. Browser fullscreen is opt-in with `mode="native"` or `presentation="native"`.

  ### `@segnavia/voice`

  - Adds pronunciation dictionaries for the ElevenLabs provider and publishes a lexicon to ElevenLabs as a dictionary.
  - Providers without dictionary support fall back to respelling from the lexicon.

  ### `@segnavia/render`

  - A single-page PDF now clips sideways overflow at the page edge instead of shrinking the page.

  ### `@segnavia/capture`

  - Keeps the capture package aligned with the shared 0.4.0 package release; it has no package-specific API changes.

## 0.3.0

### Minor Changes

- ### `@segnavia/format`

  - Adds an optional deck `transition` (fade or slide). Turns stay instant when it is absent.
  - Adds optional slide timing (`beforeMs`, `afterMs`, `holdMs`) and optional deck `playback` (`step` or `continuous`) and `captions` (`on`, `off` or `viewer`). None has a default.

  ### `@segnavia/html`

  - Keeps the HTML package aligned with the shared 0.3.0 package release; it has no package-specific API changes.

  ### `@segnavia/frame`

  - Plays a deck's transition on each turn. A host overrides it on the stage with the `transition` and `transition-duration` attributes or the `transition` property, where `'none'` turns transitions off.
  - The stage turns onto a neighbor slide only once that slide has loaded.
  - Adds pure deck timelines, continuous playback, seek, pause and resume, and persisted viewer mute and caption settings.
  - Adds the `m`, `c` and `f` keys for mute, captions and presentation. They are ignored while typing in an editable field.
  - Breaking: the `ControllerOptions.clock` callback now receives `(slide, audio)` instead of `(narration, audio)`.
  - Breaking: `momentAt(...).annotations` is now `number[] | null`, where `null` means every annotation shows (a slide without narration).
  - Behavior change for existing hosts: pause keeps the position, and Play resumes from it rather than restarting the slide. Play after the deck has ended restarts from the first slide.

  ### `@segnavia/voice`

  - Keeps the voice package aligned with the shared 0.3.0 package release; it has no package-specific API changes.

  ### `@segnavia/render`

  - Adds the `effects` render option, on by default. It rewrites how Chromium writes CSS shadows, blurs and fades into the PDF, so that Apple Preview and Adobe draw them like the screen, and leaves a mask exactly as written when it cannot redraw it exactly. `effects: false` turns it off, and `effects.report` receives counts of rewritten and kept masks.
  - The `press` option now converts conic and repeating gradients to CMYK by sampling their shading.

  ### `@segnavia/capture`

  - Keeps the capture package aligned with the shared 0.3.0 package release; it has no package-specific API changes.

## 0.2.0

### Minor Changes

- ### `@segnavia/format`

  - Adds print geometry for trim, bleed, safe areas, crop marks, and custom paper sizes in points.
  - Adds impositions with paper grids, margins, gaps, fit and fill placement, skipped cells, reading direction, and one- or two-sided output with long- or short-edge flips.

  ### `@segnavia/html`

  - Keeps the HTML package aligned with the shared 0.2.0 package release; it has no package-specific API changes.

  ### `@segnavia/frame`

  - Adds on-screen imposed papers and browser printing for imposed pages and decks, including two-sided output.
  - Adds neighbor frames, stable frame identity, page keys, in-window presentation, viewport fitting, and clamped slide links to the deck player.
  - Swaps scripted slides after the incoming frame loads and rebuilds frames when the scripts policy or host CSS changes. Calling `load()` no longer writes `location.hash`.

  ### `@segnavia/voice`

  - Keeps the voice package aligned with the shared 0.2.0 package release; it has no package-specific API changes.

  ### `@segnavia/render`

  - Renders pages and decks through an imposition, including two-sided papers, and preserves HTML slide backgrounds in deck PDFs.
  - Adds a press color engine and a `press` render option that converts PDF output to CMYK through an ICC profile and reports authored raster images that stay RGB.
  - Prints a page with trim and bleed boxes, safe-area properties, and crop marks.

  ### `@segnavia/capture`

  - Keeps the capture package aligned with the shared 0.2.0 package release; it has no package-specific API changes.

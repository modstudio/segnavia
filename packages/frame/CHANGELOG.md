# @segnavia/frame

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
- a98274d: Add deduplicated preflight checks for in-frame missing fonts, reasoned missing placements, overset slots, invalid custom properties across composed styles, and fetching CSS constructs to composed books and printed pages.
- 9fb55dd: Add bounded preflight profiles, issues and layout facts for composed books and printed pages. Browser book and page elements now emit live `preflight` reports, and strict profiles refuse overset regions or furniture.

  Breaking on 0.x: preflight replaces the `data-segnavia-region-overflow` and `data-segnavia-furniture-overflow` attributes. Render's `OverflowReport` no longer carries region or furniture entries; composed renders can report server-side preflight through their render options.

- dd8cf59: Add server preflight reports to composed book, printed-page and page-image renders, and let document descriptions carry a preflight section. A render refuses a preflight profile that does not resolve before it starts the browser. Frame exports `PREFLIGHT_ATTRIBUTE` from its book-document and printed-page-document entries.

### Patch Changes

- Updated dependencies [24c5777]
- Updated dependencies [c2e0bbb]
- Updated dependencies [a98274d]
- Updated dependencies [9fb55dd]
- Updated dependencies [dd8cf59]
  - @segnavia/format@0.54.0
  - @segnavia/layout@0.54.0
  - @segnavia/html@0.54.0

## 0.53.0

### Minor Changes

- 370e995: Let slot values and the Fields panel use per-design overrides ahead of shared fills.
- 3d69490: Edit board label text in place with one undoable change.
- b44a38d: Expose structured measure, limit and actual values when a host limit refuses format, frame or render output.
- 7f5ed55: Export font manifest reference helpers and accept references, an optional font manifest or no fonts when reading or packing local fonts.
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
- 25f56a9: Show every reported slot state in the item settings Fields panel.
- 1bd389b: Select, move, nudge, wrap, and resize board labels alongside board items.
- c775264: Let hosts render every Fields panel control through keyed control renderers.

### Patch Changes

- 56bb43a: Include each package's changelog in its published tarball.
- 7cade3b: Emit each item settings fill edit before its debounced save.
- 358b110: Paginated books now honor keeps on nested blocks. A list item or other
  block inside a container that sets `break-inside: avoid` is no longer split
  across pages. A nested heading or speaker kept with the next element moves
  with the block that follows its container instead of ending a page alone.
- c202b83: Let hosts style the item-settings panel's type, spacing, controls, and focus ring with custom properties.
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
  - @segnavia/layout@0.53.0

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
  - @segnavia/layout@0.52.0
  - @segnavia/html@0.52.0

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

- 9d16f46: Take a page Document as the designed-cover input and refuse the legacy Page shape. Put the cover print setting on the Document root; a print setting on the page node is not read. The cover page body must contain stored HTML, so pass a markdown Document through `@segnavia/html`'s `parseDocument` first. Parsed covers still expose the lowered Page value to render and frame consumers.
- 498edfc: Declare a document's fonts as a font manifest and report every face that is missing. `StyleSheet.fonts` is now a record keyed by font name: an app font with its `FontDeclaration` faces (`weight`, `style`, `unicodeRange`, `script: 'hebrew'`), or a local font with its fallback. A Hebrew face with no range covers `U+0590-05FF,U+FB1D-FB4F`. A declared face the host does not supply is reported `unsupplied`, and one Chromium does not load is reported `unloaded`; composition continues at the fallback. Render reports through `fontLoad.report({ failures })`, and the page, paper, stage and book elements dispatch `fontfailure`. Add `matchFaces`, `rangeSample`, `fontManifestWithReferences` and `persistedFontManifestWithReferences`. Breaking: the retired `FontReference[]` form of `style.fonts` is refused, and a font the source does not know no longer refuses the render.
- 5a1a73f: Put press fields in a printable Document's `print` setting for decks, books and printed pages. Their PDFs now write trim and bleed boxes and crop marks on every page, and deck notes sheets take press fields from the deck's `print`.

  Imposition no longer accepts `bleed` or `safe`, and `notesPaper` no longer accepts press fields. Pieces on one imposition must have the same `print.bleed` and `print.safe`; composition refuses the first piece that differs. Invalid paper fields on deck and book `print` values, removed imposition fields, removed `PrintOptions.sheet`, and press fields on `notesPaper` are refused with their replacement settings.

- 92717bd: Show printed Documents in `segnavia-page` as a scrolling column of composed papers.
- b5b5cee: Load declared faces before composing books and printed pages, and report unloaded faces while rendering with the fallback. Printed pages now embed resolved app fonts, and printed Documents shown in `<segnavia-page>` dispatch their unsupplied and unloaded font failures.
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

- b44900a: Compose books and printed pages with one measure, plan, and dress runtime. Replace `BOOK_COMPOSER_SCRIPT` and `PRINTED_PAGE_COMPOSER_SCRIPT` with `COMPOSER_SCRIPT` and `composerScript`, and add optional `PaginateBlock.id`, `PaginateBlock.breakBefore` and `PaginateBlock.breakAfter` measurements. A forced page break before or after a block starts a new page in the plan.
- c72645f: Resolve every ordinary page frame's root direction, and its print margins, from
  one rule: a `dir` on the author's own `<html>` root, then the page's `dir`, then
  its `lang`, then the first strong letter of its visible text, with left to right
  as the fallback. A Hebrew page with no `dir` now lays out right to left. A `dir`
  or `lang` the author's root declares is kept and never duplicated.

### Patch Changes

- ba2b416: A book section may set `contentsLabel` and `subtitle`. The label replaces the section title in the contents entry and the PDF bookmark, and the subtitle sits beneath the contents entry. Each takes its own text's direction first through `entryDirection`. An empty label or subtitle is refused. A placed section now keeps every section field when it resolves.
- 1395b57: A book section may set `opens: 'continue'` to join the preceding flowing section's flow without a page break, keeping its own contents entry, outline node, heading destination and running-head title. `BookOpens` gains `continue`, while a part's `opens` stays `recto`, `verso` or `any`. `continue` is refused on the first section of a division or part, on or after a non-flowing section, and together with section `numbering` or `parents`. Recto planning skips a continuing section. A page mark whose element sets `data-mark-scope="flow"` is not carried into a later section's flow, and `PaginateMark` and `PaginatePageMarks` carry that optional `scope`. The `title` running-head source shows the first section title on the page.
- 28ecd63: Printed pages take their direction from an authored root dir before page dir, language and text.
- 22c3521: A paginated book section may set `numbering: { counted: false }` or `numbering: { restart: N }`. Plan folios are the single source of page numbers: `Plan.folios` entries are `string | null`, where null marks an uncounted or blank page, and must match `pages` in length. Contents numbers and running folios read them, and the printed PDF carries them as page labels. Section numbering is refused on a continuous book or with a restart beyond the division's number system.
- fefb30e: Allow each paginated book section to select a named paper geometry while keeping one page plan and one PDF. Page composition, screen presentation, saved plans, parent pages, placements, running furniture, folios, destinations and press boxes follow each page's selected trim.
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
  - @segnavia/layout@0.51.0

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

### Patch Changes

- 8f84d79: Add universal book and printed-page planning, including capped convergence, and route frame composition through the shared plans.
- Updated dependencies [24b0cc8]
- Updated dependencies [8f84d79]
- Updated dependencies [6ac32e4]
- Updated dependencies [2df0afb]
  - @segnavia/html@0.50.0
  - @segnavia/layout@0.50.0
  - @segnavia/format@0.50.0

## 0.49.0

### Migrating from 0.48

See the `@segnavia/format` 0.49.0 changelog for what to change in stored documents and host calls.

### Minor Changes

- ea9421b: Pass `{ type: 'document', kind: 'deck', ... }` for decks and `{ type: 'document', kind: 'page', ... }` for screen pages. Deck and page entry points no longer accept the old `Deck` and `Page` input shapes, and `deckFromSlides` now returns a deck `Document`.
- ed3c7cd: Replace package-local paper, margin, size, and direction types with the shared format values.

  Book and parent-page content margins now require all four logical edges and refuse legacy physical or inner/outer names.

  Print margins are binding-relative, so right-to-left single-page printing mirrors the inline edges.

  Raster media intrinsic sizes now require whole pixels, while vector and document media sizes remain point-valued and may be fractional.

  The IDML package no longer exports `IdmlMargin`; IDML page margins use the shared `PhysicalMargin` type, in points.

- 7c5952b: Add the shared `Numbering` value, `computeFolios`, and `sequenceFolios`, including restarts and uncounted pages.

  Compute book, printed-page, deck, and rendered PDF folios through the shared function without changing their rendered numbering.

- ea9421b: Pass `{ type: 'document', kind: 'book', ... }` for books and `{ type: 'document', kind: 'printed', ... }` for composed printed pages. The old `Book` and `printedPages` input shapes are no longer accepted at those entry points.
- e126784: Mint required node and content-block ids through a host-supplied `newId` seam, preserve existing ids, and refuse duplicates across one document.
- ea9421b: Placement resolvers now return a page or printed `Document` in a page answer. See “Document input and migration” in `docs/architecture.md` for the payload mapping.
- 860d9d3: Replace the separate page, deck, render, image and local-font ceilings with one format-owned `Limits` value.

  Resolve document page declarations against host ceilings and use one refusal text at every enforcement site.

  Render hosts rename `maxSheets` to `sheets` and `maxBytes` to `bytes`; deck hosts rename `maxSlides` to `slides`, `maxSlideBytes` to `slideBytes` and `maxNotesBytes` to `notesBytes`. Local-font count and byte ceilings move from `localFonts.limits` to `limits.localFonts`. Capture keeps its own `output.maxBytes` option and maps it to `limits.bytes`.

- ea9421b: Pass `{ type: 'document', kind: 'board', ... }` to `<segnavia-board>`. Its `board` property, change and share events, and editing callback now carry the board `Document`; `documentFromBoard` raises internal board edits without dropping the source document's root fields.

  Board item resolvers now return deck and page `Document` payloads, and paper item resolvers return page or printed `Document` payloads.

### Patch Changes

- ea9421b: Type Vue and React element properties by the values their setters accept.
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

### Minor Changes

- ed0f315: Make printed-page composition independent of the host window and share the paper viewport calculation across browser and server printing.
- e25fc69: Add shared document metadata for printed-page previews and PDFs.

### Patch Changes

- 8d1c362: Load the offline diagram script only for rendered content that contains a diagram, and keep Mermaid out of runtime installations.
- Updated dependencies [ed0f315]
- Updated dependencies [e25fc69]
  - @segnavia/format@0.48.0
  - @segnavia/html@0.48.0

## 0.47.0

### Minor Changes

- 6ef773e: Keep small printed structures together by default and allow content CSS to control fragmentation explicitly.
- 1b85f5e: Mark each composed page as recto or verso for direction-independent side-aware styling.

### Patch Changes

- 100d32f: Report printed-page composition refusals to the previewing host.
- Updated dependencies [6ef773e]
- Updated dependencies [b9754e3]
- Updated dependencies [1b85f5e]
  - @segnavia/format@0.47.0
  - @segnavia/html@0.47.0

## 0.46.0

### Patch Changes

- 19d356b: Count printed papers through the last column painted by each content fragment.
  - @segnavia/format@0.46.0
  - @segnavia/html@0.46.0

## 0.45.0

### Minor Changes

- ae3c3e7: Let hosts scroll a page element to a markdown heading.

### Patch Changes

- 43e786b: Keep paginated page notes inside their planned space when fonts or images finish loading after composition: the composer re-derives each note view's extent from its laid-out lines and re-stacks the views, and refuses a note whose lines changed after pagination or whose settled stack would move into the body.
- 5b151b7: Draw an incoming deck frame beneath the active slide while it loads so a turn never reveals an empty stage.
  - @segnavia/format@0.45.0
  - @segnavia/html@0.45.0

## 0.44.0

### Minor Changes

- 5a64fcc: Add `--segnavia-keep-with: next | previous` for keeping inline elements with an adjacent word and block elements with an adjacent page or column block.
- 70ceccb: Add optional measured sizes to `BoardLabel` and export `boardShapes`, `BoardItemFact`, `labelShape`, `provisionalShape`, and `resolvedShape` from format.

  Boards whose items reuse one address for different asset kinds are now refused; hosts with such stored boards must give each kind its own address.

  The public `resolvedShape` export from frame now takes a `BoardItemFact` instead of a `ResolvedBoardItem`; callers must pass the format shape fact.

### Patch Changes

- e222d0b: Pausing from a `change` listener now stops playback updates, and a rail render no longer reloads its mounted thumbnail frames.
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

### Minor Changes

- 0a67036: Add watched progress to deck state with reach, share, and complete values, a `complete` event, the `seek: 'furthest'` player option, and `addNavigationGuard` for host navigation gates.
- a039f61: Properties set on an element before its definition loads now take effect. Frame also adds the `@segnavia/frame/element-properties` entry.
- 9501964: Add opt-in Vue 3.5 template types for every public custom element prop and event.

### Patch Changes

- Updated dependencies [817cfb2]
- Updated dependencies [4f77670]
  - @segnavia/html@0.43.0
  - @segnavia/format@0.43.0

## 0.42.0

### Minor Changes

- 7551f97: Move the Markdown editor into the optional `@segnavia/markdown-editor` package.

  Hosts that used `@segnavia/frame/markdown-editor` install `@segnavia/markdown-editor` and its peers and import from it. `@segnavia/react/markdown-editor` keeps its path but now needs `@segnavia/markdown-editor` installed.

- 30ed75c: Move Mermaid drawing into the optional `@segnavia/diagrams` package behind a provider seam.

  Hosts that draw diagrams in their own bundle add `import '@segnavia/diagrams/auto'`, or call `registerDiagramProvider(diagrams)`.

### Patch Changes

- @segnavia/format@0.42.0
- @segnavia/html@0.42.0

## 0.41.0

### Minor Changes

- c5e08f1: A `<segnavia-thumbnail>` frame no longer carries a script unless a `shrink`, `truncate` or `refuse` slot needs fitting: without one its sandbox is empty and its policy refuses every script. Rail thumbnails keep the bridge.
- 31161b0: `DeckController.goToSlide(id)` navigates by slide id. It resolves `true` when the deck is on that slide afterward, and `false` for an unknown id or a navigation that did not land there. A navigation that waited on a navigation guard while a new deck loaded is dropped rather than applied to the new deck.
- ca7e3a2: Add a slim `@segnavia/frame/deck` entry for headless deck viewing, export `formatTime` from the main entry, and precisely declare registration side effects.
- c27abf8: A `DeckController` you construct no longer reads or writes `location.hash`; pass `hash: 'slide-'` to keep the old behavior. `<segnavia-player>` and `<segnavia-stage src>` are unchanged.

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

### Minor Changes

- 636664c: Add full, standard, wide and numeric widths for flowing pages, with shared host overrides across browser and server surfaces.

  The `FLUID_WIDTH` format export is removed. Use `PAGE_WIDTHS` or `resolvePageWidth` instead.

  Legacy `fluid` page data now parses as `{ width: 'full', height: 'auto' }`. Existing cover digests therefore change once, so hosts should expect to redraw cached cover images once. Re-serializing a parsed legacy page writes the new shape, which older library versions cannot read.

- e008df9: Draw markdown Mermaid diagrams offline inside page frames before readiness and pagination, with per-diagram failure output and bidirectional labels.

  The diagrams entry exports the nonce-authorized drawing script. Server render inlines it and waits for the drawing before capture. Any page body carrying the `pre[data-segnavia-diagram="mermaid"]` placeholder is drawn, HTML included. Markdown outlines may now receive the markdown body object so HTML and outline conversion share one pass.

- 528b896: Add rich Markdown editing with byte-preserving locked blocks, sanitized schema input, commands, editor state and page-matched CSS and fonts.

  Rich mode is the default.

  Markdown editor user changes now update only the live property; the `markdown` attribute remains the initial or latest host-declared value.

- 2a55d52: Add the headless markdown editor element with source editing, title sources, browser events, commands, keyboard shortcuts, and a React component.

### Patch Changes

- Updated dependencies [636664c]
- Updated dependencies [e008df9]
- Updated dependencies [12c57ab]
- Updated dependencies [528b896]
  - @segnavia/format@0.40.0
  - @segnavia/html@0.40.0

## 0.39.0

### Minor Changes

- 35024b0: Hosts can give decks designed covers, use stable cover picture digests, and render cover images offline at an exact thumbnail width. A cover takes any sheet its print setting describes, and 160 × 100 mm when it has none. Boards and thumbnails display designed covers. Page images with a print setting are drawn at the sheet size and no longer grow to their content height.
- f8ab208: Add page references to books. An empty `<a href="#id" data-ref="page"></a>` shows the folio of the page where its target lands, in that part's numbering, in a paginated book and in a continuous PDF. In a continuous book on screen it stays an empty link. A missing target, or a target id used in more than one section, is refused.

  Contents page numbers are now page references. The number is `a.segnavia-contents-page[data-ref="page"]`, replacing `span.segnavia-contents-page[data-target]`, and it no longer carries `data-target`. Host CSS or scripts that select the span or `data-target` need updating.

- 9f1b83f: Hosts can use one asset resolver to place media in books, decks, and boards across browser and server output. Slot, board, and IDML adapters accept the same placement model.
- 50e14d4: Report a paginated book composer's refusal through the book element's `error` event without replacing its working layout.
- 0979253: Resolve placed media in page and book HTML through one host seam: an `img` with `data-segnavia-media` is resolved through the `placements: { resolve, report? }` option on page, paper, document, book, thumbnail and board elements, browser `printPages` and the page and book render options. `@segnavia/format` exports `FLUID_WIDTH`, the viewport width of a fluid page.
- dd46281: Stack several page-placed note series at the foot of a paginated book page. Each used series forms a declaration-ordered group with its own measured top gap, numbering and marker, and continued notes remain in their series group on later pages.

### Patch Changes

- 2341d56: Read a named face from a TrueType or OpenType collection. Collection faces are selected by PostScript name and extracted to standalone font bytes before browser or PDF loading.
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

- 3d703f5: Expand host motifs placed in book sections on screen and in book PDFs.
- 4824f85: Store artifact-style HTML unchanged as a scripted page. Hosts can set `dependencyOrigins` for scripts, styles and fonts and supply the render-time `dependencies` cache seam. Static markup and render requests to known package CDNs require exact versions; the viewer CSP is origin-granular, so runtime imports at an approved origin are not version-pinned. Scripted frames add `allow-forms` under `form-action 'none'` so submit handlers run without allowing a real submission, and never add `allow-same-origin`. Scripted viewers now refuse remote images and connections through a tighter CSP.
- e44df2c: Share one 64-face, 32 MiB local-font transport bound between browser packing and server rendering.

### Patch Changes

- ac8c6e1: Keep paginated books waiting for a measurable frame when they mount inside a hidden container or behind the flow layout. A book whose source still measures no line boxes, or plans no page, after one second of visible time is refused rather than shown empty.
- c3c0505: Add book authors and subjects, and preserve PDF metadata and outline destinations across continuous and paginated book rendering.
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

### Minor Changes

- cb5669b: Let paginated book elements switch between pages and flow while keeping the reader's place.

### Patch Changes

- A stage frame whose bridge-ready wait timed out is replaced on the slide's next resolution, even with the same reuseKey, and a late ready recovers it.
- Updated dependencies [b8c262d]
- Updated dependencies [bf40e80]
  - @segnavia/format@0.37.0
  - @segnavia/html@0.37.0

## 0.36.0

### Minor Changes

- 042a9fb: Dispatch stage events when a slide frame mounts and releases.
- 6a625f8: Expose a slide's id and current deck index on bridge-readiness stage errors.

### Patch Changes

- 229288f: Keep page selection reads with the current frame document when slot filling replaces its contents.
  - @segnavia/format@0.36.0
  - @segnavia/html@0.36.0

## 0.35.0

### Minor Changes

- d7f664c: Read the refused-script current slide selection from a stage.

### Patch Changes

- d4b912b: Resolve a neighbor slide afresh when its frame is rebuilt after eviction.
- 1009802: Resolve the shown slide afresh when its stage frames are rebuilt.
  - @segnavia/format@0.35.0
  - @segnavia/html@0.35.0

## 0.34.0

### Minor Changes

- a99558e: Reuse resolved URL frames by a stable key and report bridge-declared documents that do not become ready.

### Patch Changes

- 64125e7: Fit padded and bordered column blocks within their paginated windows.
- 99902dc: Let a block's own `dir` override the frame's first-letter direction default.
  - @segnavia/format@0.34.0
  - @segnavia/html@0.34.0

## 0.33.0

### Minor Changes

- 87881d0: Let a host give each page frame its own accessible name with `label`.

### Patch Changes

- @segnavia/format@0.33.0
- @segnavia/html@0.33.0

## 0.32.0

### Minor Changes

- 95b63be: Let a fluid page take a host-sized box and scroll inside its own frame with `bounded`.

### Patch Changes

- @segnavia/format@0.32.0
- @segnavia/html@0.32.0

## 0.31.0

### Minor Changes

- ed79d4a: Let hosts read the current selection and page text from script-refusing `segnavia-page` documents. `SegnaviaPage` gains `readSelection()`, and `@segnavia/frame` exports `PageSelection` and `SELECTION_REPLY_MS`; `@segnavia/frame/bridge` exports `selectionMessage`, `SelectionMessage` and `SELECTION_TEXT_LIMIT`.

### Patch Changes

- d84b337: Wait for parent-page frame geometry to settle by elapsed time before composing printed pages.
  - @segnavia/format@0.31.0
  - @segnavia/html@0.31.0

## 0.30.0

### Patch Changes

- 0246112: Use a page's own language to choose motif versions when no language option is supplied.
- Updated dependencies [0246112]
- Updated dependencies [677a43a]
  - @segnavia/html@0.30.0
  - @segnavia/format@0.30.0

## 0.29.0

### Patch Changes

- @segnavia/format@0.29.0
- @segnavia/html@0.29.0

## 0.28.0

### Minor Changes

- 48493cf: Carry a sanitized `Book.css` stylesheet after generated font CSS and before host render CSS in every book view and PDF.
- 7a398eb: Place chapter endnotes and split or refuse oversized blocks in a paginated book.
- 492e956: Place designed pages and per-section parent pages in a paginated book.
- 0566139: Let a host name an app font for deck notes print. printDeck and deckPdf resolve it through FontSource and embed the face in the notes head; the default is sans-serif.
- ab06b35: Print a paginated book from Chromium's line boxes, with footnotes, column runs, marks and running heads.
- 52ba024: Show paginated book views as scaled single pages or direction-aware two-page spreads in `<segnavia-book>`. `@segnavia/html` exports `bookViewFromHtml`, which builds a `BookView` from a book and its built HTML, and `embedFunction`, which embeds a function in a composer script under a name that survives minification.
- ca43ac9: Place any named page mark in a paginated book's parent-page head or foot with `data-motif="segnavia:mark"`, `data-motif-name` and optional `data-motif-which`.
- f491698: Fill templated pages, report overfull regions and apply host slot values in a paginated book.

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

## 0.27.0

### Minor Changes

- add7c29: Print pages with parent-page furniture from the browser, using the same composed papers and identity-imposition policy as server PDF rendering.
- be667fe: Add motif definitions, version selection, host source types, expansion, save-time placement refusals, and consistent page viewing, image and PDF wiring.
- eadae7c: Move book folios and running heads onto default parent pages backed by reserved library motifs.
- f98d1bd: Package a page's named local font faces as JSON-safe transport and accept them for one server render alongside the FontSource that establishes each local reference's app-font fallback. Validate signatures and host-set limits, embed only requested families, report missing local faces, and retain no decoded face after the call.
- efb84cb: Let a page and a motif name app and local fonts. The host supplies app faces through FontSource; a browser helper reads local fonts. Preview, print and server PDF embed the same data: faces for app fonts. A server PDF shows the declared fallback for a local font until server local fonts exist.
- bc3b86c: Add inherited parent pages, printed-page roles and numbered head and foot motifs to server-rendered flowing pages.

### Patch Changes

- Updated dependencies [add7c29]
- Updated dependencies [be667fe]
- Updated dependencies [eadae7c]
- Updated dependencies [f98d1bd]
- Updated dependencies [efb84cb]
- Updated dependencies [bc3b86c]
  - @segnavia/format@0.27.0
  - @segnavia/html@0.27.0

## 0.26.0

### Patch Changes

- Updated dependencies [31831c0]
- Updated dependencies [84522f0]
  - @segnavia/format@0.26.0
  - @segnavia/html@0.26.0

## 0.25.0

### Patch Changes

- 8aa5beb: Keep unsaved item settings values visible when the host refreshes fills during a pending save.
- Updated dependencies [8aa5beb]
  - @segnavia/format@0.25.0
  - @segnavia/html@0.25.0

## 0.24.0

### Minor Changes

- 7fb9876: Open host-placed item settings from authoring rails and expose current slide settings as an item-settings section.

### Patch Changes

- 5303c90: Item settings controls use the --segnavia-radius token for their corners.
- 5303c90: Document rail thumbnails show the same slot fill as the pages they preview.
- dfbfc4e: printPages waits for every filled slot's fit report before deciding, so a slow frame can no longer print an overflowed refuse slot.
- Updated dependencies [7ae70b2]
- Updated dependencies [7f23541]
  - @segnavia/format@0.24.0
  - @segnavia/html@0.24.0

## 0.23.0

### Minor Changes

- b8d700b: Add measured per-slot overflow policies and refuse printing when configured text does not fit.
- 2826705: Add host data sources as a second slot fill layer with per-value hand overrides.
- c47e666: Add a standalone item settings element with a Fields section, fill switcher, and host-owned fill authoring.
- 8a6826c: Print every slot fill in one PDF, skipping refused copies only when asked.
- 20456e8: Add QR slots, refuse print and server output with unfilled required slots, and collapse unfilled optional slot elements.

### Patch Changes

- 68757a0: Revealing a board item no longer pulls focus back to it once its real size loads, so typing elsewhere after picking an item from the list cannot delete it.
- Updated dependencies [b8d700b]
- Updated dependencies [2826705]
- Updated dependencies [8a6826c]
- Updated dependencies [20456e8]
  - @segnavia/format@0.23.0
  - @segnavia/html@0.23.0

## 0.22.0

### Minor Changes

- 20cdad3: Declare reusable item slots and fill them consistently in viewers, thumbnails, browser print, and server renders.

### Patch Changes

- Updated dependencies [20cdad3]
  - @segnavia/format@0.22.0
  - @segnavia/html@0.22.0

## 0.21.0

### Minor Changes

- 2c84e8c: Add optional page identities and a document authoring rail with optimistic drag and keyboard reordering.
- 77ae491: Add translatable named-paper metadata, bounded custom paper validation, stored print-setting schemas, and a paper picker with a React wrapper.

### Patch Changes

- Updated dependencies [2c84e8c]
- Updated dependencies [77ae491]
  - @segnavia/format@0.21.0

## 0.20.0

### Minor Changes

- 1f9f4c6: Show ordered page documents on responsive, lazily mounted paper sheets; draw a
  page thumbnail at its paper aspect ratio; measure page backgrounds through the
  browser print pipeline; and expose React wrappers for pages, papers, and documents.

### Patch Changes

- @segnavia/format@0.20.0

## 0.19.0

### Minor Changes

- 0f1cf64: Let authors choose or reset an animated HTML slide's print moment from a Slide settings list with a live frame scrubber.

### Patch Changes

- @segnavia/format@0.19.0

## 0.18.0

### Minor Changes

- 02c3457: Let each slide choose the frozen animation moment used by browser and PDF deck printing, and let scripted slides hold readiness while drawing that moment.

### Patch Changes

- Updated dependencies [3dfbd5a]
- Updated dependencies [02c3457]
  - @segnavia/format@0.18.0

## 0.17.0

### Minor Changes

- ed1d7f1: Rename `step` playback to `segmented`; `step` still parses. Show the deck's time in both playback modes, hide Play on a deck nothing can play, hide host actions while presenting, keep the stage shadow inside the player, fade the rail's scrolled edges, use the closed-caption icon, and label the notes field "Notes".

### Patch Changes

- Updated dependencies [ed1d7f1]
  - @segnavia/format@0.17.0

## 0.16.0

### Minor Changes

- 3c52b32: Lay out auto-managed board sections as explicit grids and edit their cell placements.

### Patch Changes

- Updated dependencies [3c52b32]
  - @segnavia/format@0.16.0

## 0.15.0

### Minor Changes

- 784441c: Serialize notes saves per slide, adopt host notes without a reload, treat a pending move as dirty, expose `draftDeck()` for export, keep an internal load moving while a notes save is in flight, and unmount far rail thumbnails.

### Patch Changes

- @segnavia/format@0.15.0

## 0.14.0

### Minor Changes

- aea4e97: Fit board sections to their members across membership changes, preserve membership within the starting box, show drop targets, and move overlapping items, sections and labels clear as one undoable edit.

### Patch Changes

- f67a5db: Contain-fit accounts for the player's own caption, bar, below slot and stacked rail, so a host reserve is only page chrome. The desk rail is a scroll box bounded by the body row and mounts only nearby thumbnails.
- Updated dependencies [aea4e97]
  - @segnavia/format@0.14.0

## 0.13.0

### Minor Changes

- c70aceb: Add opt-in multi-selection board editing with queued writes and undo history. The existing `selected` board property remains as the single-item view of `selection`, and selection events carry both `items` and `item`.

### Patch Changes

- 44ebc49: At compact widths with controls below, show host actions side by side on one row below the rail, with a lighter stage edge; a bare text button stretches to its share. Keyboard order stays Next, host actions, end controls, then the rail. Overlay captions clear the measured bar height.
- Updated dependencies [c70aceb]
  - @segnavia/format@0.13.0

## 0.12.0

### Minor Changes

- 01fe469: Let a host export the notes the author sees, print an escaped document title, and show a placeholder on notes sheets that have none.
- 3632f54: Add board kind icons, single-item selection, title actions, and a toolbar list toggle.

### Patch Changes

- @segnavia/format@0.12.0

## 0.11.0

### Minor Changes

- 5332823: Add board zoom methods and the headless board toolbar with optional Share reporting.
- 88a3de9: Add board listing policy, host-provided item names and content search, reveal geometry, and the headless `<segnavia-board-list>` element.
- c6afc85: A slide thumbnail takes the host stylesheet through `css`, as the stage does, so a cover is drawn the way the slide is shown in the player.

### Patch Changes

- Updated dependencies [88a3de9]
  - @segnavia/format@0.11.0

## 0.10.0

### Minor Changes

- c7cd26b: Add the headless board viewer with lazy item resolution, pan and zoom, and cover-to-live detail.

### Patch Changes

- Updated dependencies [ca26399]
  - @segnavia/format@0.10.0

## 0.9.1

### Patch Changes

- @segnavia/format@0.9.1

## 0.9.0

### Minor Changes

- c495b99: Flush pending authoring notes on detach and adopt settled notes from reloaded decks.

  React authoring cleanup now preserves pending notes when its player unmounts.

- 6e2b2dc: Flow long speaker notes onto owned continuation sheets, preserve print color intent inside slide frames, and bound browser print readiness and teardown.
- 82b0071: Add opt-in responsive decks whose screen canvases reflow at the stage box size while rail thumbnails and print remain fixed.

### Patch Changes

- Updated dependencies [82b0071]
  - @segnavia/format@0.9.0

## 0.8.0

### Minor Changes

- 20bd5e6: Add a deck-level framed-image option with per-slide overrides for images and shots.

  Give slide canvases in the styled player a white, host-customizable backdrop while keeping headless stages transparent.

- 26b6621: Add a script-refusing, viewport-lazy slide thumbnail element for deck covers, with a matching React component.
- 591c819: `@segnavia/format` adds deck and slide fit options for image and shot content.

  `@segnavia/frame` applies shared fit geometry to the stage, rail and print output.

### Patch Changes

- Updated dependencies [20bd5e6]
- Updated dependencies [591c819]
  - @segnavia/format@0.8.0

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

### Patch Changes

- Updated dependencies
  - @segnavia/format@0.7.0

## 0.6.0

### Minor Changes

- ### `@segnavia/format`

  - Keeps the format package aligned with the shared 0.6.0 package release; it has no package-specific API changes.

  ### `@segnavia/html`

  - Keeps the HTML package aligned with the shared 0.6.0 package release; it has no package-specific API changes.

  ### `@segnavia/frame`

  - Defaults to `fit="contain"`, sizing players to contain their slide and controls in the visible viewport.
  - Adds `controls="overlay"` to overlay controls on the slide.
  - Adds the `--segnavia-fit-reserve` and `--segnavia-overlay-scrim` tokens.
  - Stops playback when a player or externally controlled stage disconnects.
  - Behavior change: hosts that need 0.5.0's width-only sizing can set `fit="width"`.

  ### `@segnavia/react`

  - Its `fit` and `controls` props now use the frame's `PlayerFit` and `PlayerControls` types.
  - The package is not yet published to npm.

  ### `@segnavia/render`

  - The press option accepts a greyscale ICC profile and writes a DeviceGray PDF through it.

  ### `@segnavia/capture`

  - Keeps the capture package aligned with the shared 0.6.0 package release; it has no package-specific API changes.

  ### `@segnavia/voice`

  - Keeps the voice package aligned with the shared 0.6.0 package release; it has no package-specific API changes.

### Patch Changes

- @segnavia/format@0.6.0

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

### Patch Changes

- Updated dependencies
  - @segnavia/format@0.5.0

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

### Patch Changes

- Updated dependencies
  - @segnavia/format@0.4.0

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

### Patch Changes

- Updated dependencies
  - @segnavia/format@0.3.0

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

### Patch Changes

- Updated dependencies
  - @segnavia/format@0.2.0

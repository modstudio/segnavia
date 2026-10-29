# @segnavia/html

## 0.33.0

### Patch Changes

- @segnavia/format@0.33.0

## 0.32.0

### Patch Changes

- @segnavia/format@0.32.0

## 0.31.0

### Patch Changes

- @segnavia/format@0.31.0

## 0.30.0

### Patch Changes

- 0246112: Use a page's own language to choose motif versions when no language option is supplied. Export `documentLanguage`, which reads a document's own non-empty `<html lang>`.
- 677a43a: Accept a variable font's weight range on a host-supplied face. Refuse `bolder` and `lighter` as face weights.
- Updated dependencies [677a43a]
  - @segnavia/format@0.30.0

## 0.29.0

### Minor Changes

- 0e118dc: Export `BOOK_COLUMN_MIN` and `BOOK_COLUMN_MAX`, the bounds on a block's `data-columns` count, so importers can check a column count before writing it.

### Patch Changes

- @segnavia/format@0.29.0

## 0.28.0

### Minor Changes

- 48493cf: Carry a sanitized `Book.css` stylesheet after generated font CSS and before host render CSS in every book view and PDF.
- 7a398eb: Place chapter endnotes and split or refuse oversized blocks in a paginated book.
- 492e956: Place designed pages and per-section parent pages in a paginated book.
- e6ebbd7: The package now exports a pure page planner for paginated books.
- ab06b35: Print a paginated book from Chromium's line boxes, with footnotes, column runs, marks and running heads.
- 52ba024: Show paginated book views as scaled single pages or direction-aware two-page spreads in `<segnavia-book>`. `@segnavia/html` exports `bookViewFromHtml`, which builds a `BookView` from a book and its built HTML, and `embedFunction`, which embeds a function in a composer script under a name that survives minification.
- ca43ac9: Place any named page mark in a paginated book's parent-page head or foot with `data-motif="segnavia:mark"`, `data-motif-name` and optional `data-motif-which`.
- a9b9c57: Sanitize fetching CSS constructs at rule and declaration granularity. `SanitizeOptions.dataFonts`, also accepted by `fill` and motif expansion, keeps author-embedded data fonts when true and defaults to false.

  `findActiveContent` may now report `<style> @import`, `<style> url()`, `<style> image-set()`, or `<style> data font`, and the same strings with `tag[style]` in place of `<style>`, where `tag` is the element name. These replace the previous bare `<style>` and `tag[style]` reports.

- f491698: Fill templated pages, report overfull regions and apply host slot values in a paginated book.

### Patch Changes

- Updated dependencies [48493cf]
- Updated dependencies [492e956]
- Updated dependencies [ab06b35]
- Updated dependencies [ca43ac9]
- Updated dependencies [f491698]
  - @segnavia/format@0.28.0

## 0.27.0

### Minor Changes

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

## 0.26.0

### Patch Changes

- Updated dependencies [31831c0]
- Updated dependencies [84522f0]
  - @segnavia/format@0.26.0

## 0.25.0

### Patch Changes

- Updated dependencies [8aa5beb]
  - @segnavia/format@0.25.0

## 0.24.0

### Patch Changes

- Updated dependencies [7ae70b2]
- Updated dependencies [7f23541]
  - @segnavia/format@0.24.0

## 0.23.0

### Minor Changes

- b8d700b: Add measured per-slot overflow policies and refuse printing when configured text does not fit.
- 2826705: Add host data sources as a second slot fill layer with per-value hand overrides.
- 8a6826c: Print every slot fill in one PDF, skipping refused copies only when asked.
- 20456e8: Add QR slots, refuse print and server output with unfilled required slots, and collapse unfilled optional slot elements.

### Patch Changes

- Updated dependencies [b8d700b]
- Updated dependencies [2826705]
- Updated dependencies [20456e8]
  - @segnavia/format@0.23.0

## 0.22.0

### Minor Changes

- 20cdad3: Declare reusable item slots and fill them consistently in viewers, thumbnails, browser print, and server renders.

### Patch Changes

- Updated dependencies [20cdad3]
  - @segnavia/format@0.22.0

## 0.21.0

### Patch Changes

- Updated dependencies [2c84e8c]
- Updated dependencies [77ae491]
  - @segnavia/format@0.21.0

## 0.20.0

### Patch Changes

- @segnavia/format@0.20.0

## 0.19.0

### Patch Changes

- @segnavia/format@0.19.0

## 0.18.0

### Patch Changes

- Updated dependencies [3dfbd5a]
- Updated dependencies [02c3457]
  - @segnavia/format@0.18.0

## 0.17.0

### Patch Changes

- Updated dependencies [ed1d7f1]
  - @segnavia/format@0.17.0

## 0.16.0

### Patch Changes

- Updated dependencies [3c52b32]
  - @segnavia/format@0.16.0

## 0.15.0

### Patch Changes

- @segnavia/format@0.15.0

## 0.14.0

### Patch Changes

- Updated dependencies [aea4e97]
  - @segnavia/format@0.14.0

## 0.13.0

### Patch Changes

- Updated dependencies [c70aceb]
  - @segnavia/format@0.13.0

## 0.12.0

### Patch Changes

- @segnavia/format@0.12.0

## 0.11.0

### Patch Changes

- Updated dependencies [88a3de9]
  - @segnavia/format@0.11.0

## 0.10.0

### Patch Changes

- Updated dependencies [ca26399]
  - @segnavia/format@0.10.0

## 0.9.1

### Patch Changes

- @segnavia/format@0.9.1

## 0.9.0

### Patch Changes

- Updated dependencies [82b0071]
  - @segnavia/format@0.9.0

## 0.8.0

### Patch Changes

- Updated dependencies [20bd5e6]
- Updated dependencies [591c819]
  - @segnavia/format@0.8.0

## 0.7.0

### Patch Changes

- Updated dependencies
  - @segnavia/format@0.7.0

## 0.6.0

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

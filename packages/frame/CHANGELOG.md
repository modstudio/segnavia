# @segnavia/frame

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

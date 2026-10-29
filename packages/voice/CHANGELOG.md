# @segnavia/voice

## 0.31.0

### Patch Changes

- @segnavia/format@0.31.0

## 0.30.0

### Patch Changes

- Updated dependencies [677a43a]
  - @segnavia/format@0.30.0

## 0.29.0

### Patch Changes

- @segnavia/format@0.29.0

## 0.28.0

### Patch Changes

- Updated dependencies [48493cf]
- Updated dependencies [492e956]
- Updated dependencies [ab06b35]
- Updated dependencies [ca43ac9]
- Updated dependencies [f491698]
  - @segnavia/format@0.28.0

## 0.27.0

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

### Patch Changes

- Updated dependencies [b8d700b]
- Updated dependencies [2826705]
- Updated dependencies [20456e8]
  - @segnavia/format@0.23.0

## 0.22.0

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

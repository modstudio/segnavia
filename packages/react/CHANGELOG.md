# @segnavia/react

## 0.23.0

### Minor Changes

- b8d700b: Add measured per-slot overflow policies and refuse printing when configured text does not fit.
- 2826705: Add host data sources as a second slot fill layer with per-value hand overrides.
- c47e666: Add a standalone item settings element with a Fields section, fill switcher, and host-owned fill authoring.
- 20456e8: Add QR slots, refuse print and server output with unfilled required slots, and collapse unfilled optional slot elements.

### Patch Changes

- Updated dependencies [b8d700b]
- Updated dependencies [2826705]
- Updated dependencies [c47e666]
- Updated dependencies [8a6826c]
- Updated dependencies [20456e8]
- Updated dependencies [68757a0]
  - @segnavia/frame@0.23.0

## 0.22.0

### Minor Changes

- 20cdad3: Declare reusable item slots and fill them consistently in viewers, thumbnails, browser print, and server renders.

### Patch Changes

- Updated dependencies [20cdad3]
  - @segnavia/frame@0.22.0

## 0.21.0

### Minor Changes

- 2c84e8c: Add optional page identities and a document authoring rail with optimistic drag and keyboard reordering.
- 77ae491: Add translatable named-paper metadata, bounded custom paper validation, stored print-setting schemas, and a paper picker with a React wrapper.

### Patch Changes

- Updated dependencies [2c84e8c]
- Updated dependencies [77ae491]
  - @segnavia/frame@0.21.0

## 0.20.0

### Minor Changes

- 1f9f4c6: Show ordered page documents on responsive, lazily mounted paper sheets; draw a
  page thumbnail at its paper aspect ratio; measure page backgrounds through the
  browser print pipeline; and expose React wrappers for pages, papers, and documents.

### Patch Changes

- Updated dependencies [1f9f4c6]
  - @segnavia/frame@0.20.0

## 0.19.0

### Minor Changes

- 0f1cf64: Let authors choose or reset an animated HTML slide's print moment from a Slide settings list with a live frame scrubber.

### Patch Changes

- Updated dependencies [0f1cf64]
  - @segnavia/frame@0.19.0

## 0.18.0

### Patch Changes

- Updated dependencies [02c3457]
  - @segnavia/frame@0.18.0

## 0.17.0

### Minor Changes

- ed1d7f1: Rename `step` playback to `segmented`; `step` still parses. Show the deck's time in both playback modes, hide Play on a deck nothing can play, hide host actions while presenting, keep the stage shadow inside the player, fade the rail's scrolled edges, use the closed-caption icon, and label the notes field "Notes".

### Patch Changes

- Updated dependencies [ed1d7f1]
  - @segnavia/frame@0.17.0

## 0.16.0

### Patch Changes

- Updated dependencies [3c52b32]
  - @segnavia/frame@0.16.0

## 0.15.0

### Patch Changes

- Updated dependencies [784441c]
  - @segnavia/frame@0.15.0

## 0.14.0

### Patch Changes

- Updated dependencies [f67a5db]
- Updated dependencies [aea4e97]
  - @segnavia/frame@0.14.0

## 0.13.0

### Patch Changes

- 9a36631: Give each `segnavia-*` React intrinsic its own tag literal, so a host `ElementType` still typechecks as JSX and each tag exposes only its own props.
- Updated dependencies [44ebc49]
- Updated dependencies [c70aceb]
  - @segnavia/frame@0.13.0

## 0.12.0

### Patch Changes

- Updated dependencies [01fe469]
- Updated dependencies [3632f54]
  - @segnavia/frame@0.12.0

## 0.11.0

### Minor Changes

- c6afc85: A slide thumbnail takes the host stylesheet through `css`, as the stage does, so a cover is drawn the way the slide is shown in the player.

### Patch Changes

- Updated dependencies [5332823]
- Updated dependencies [88a3de9]
- Updated dependencies [c6afc85]
  - @segnavia/frame@0.11.0

## 0.10.0

### Patch Changes

- Updated dependencies [c7cd26b]
  - @segnavia/frame@0.10.0

## 0.9.1

### Patch Changes

- @segnavia/frame@0.9.1

## 0.9.0

### Minor Changes

- c495b99: Flush pending authoring notes on detach and adopt settled notes from reloaded decks.

  React authoring cleanup now preserves pending notes when its player unmounts.

### Patch Changes

- Updated dependencies [c495b99]
- Updated dependencies [6e2b2dc]
- Updated dependencies [82b0071]
  - @segnavia/frame@0.9.0

## 0.8.0

### Minor Changes

- 26b6621: Add a script-refusing, viewport-lazy slide thumbnail element for deck covers, with a matching React component.

### Patch Changes

- Updated dependencies [20bd5e6]
- Updated dependencies [26b6621]
- Updated dependencies [591c819]
  - @segnavia/frame@0.8.0

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
  - @segnavia/frame@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies
  - @segnavia/frame@0.6.0

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
  - @segnavia/frame@0.5.0

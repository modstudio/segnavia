# @segnavia/frame

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

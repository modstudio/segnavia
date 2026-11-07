# @segnavia/diagrams

## 0.49.0

### Migrating from 0.48

See the `@segnavia/format` 0.49.0 changelog for what to change in stored documents and host calls.

### Patch Changes

- ed3c7cd: Replace package-local paper, margin, size, and direction types with the shared format values.

  Book and parent-page content margins now require all four logical edges and refuse legacy physical or inner/outer names.

  Print margins are binding-relative, so right-to-left single-page printing mirrors the inline edges.

  Raster media intrinsic sizes now require whole pixels, while vector and document media sizes remain point-valued and may be fractional.

  The IDML package no longer exports `IdmlMargin`; IDML page margins use the shared `PhysicalMargin` type, in points.

- Updated dependencies [ea9421b]
- Updated dependencies [ed3c7cd]
- Updated dependencies [53afd24]
- Updated dependencies [7c5952b]
- Updated dependencies [ea9421b]
- Updated dependencies [e126784]
- Updated dependencies [ea9421b]
- Updated dependencies [ea9421b]
- Updated dependencies [b3f94ac]
- Updated dependencies [ea9421b]
- Updated dependencies [f36066e]
- Updated dependencies [860d9d3]
- Updated dependencies [ea9421b]
- Updated dependencies [ea9421b]
  - @segnavia/format@0.49.0
  - @segnavia/frame@0.49.0

## 0.48.0

### Patch Changes

- 8d1c362: Load the offline diagram script only for rendered content that contains a diagram, and keep Mermaid out of runtime installations.
- Updated dependencies [ed0f315]
- Updated dependencies [8d1c362]
- Updated dependencies [e25fc69]
  - @segnavia/format@0.48.0
  - @segnavia/frame@0.48.0

## 0.47.0

### Patch Changes

- Updated dependencies [6ef773e]
- Updated dependencies [100d32f]
- Updated dependencies [1b85f5e]
  - @segnavia/format@0.47.0
  - @segnavia/frame@0.47.0

## 0.46.0

### Patch Changes

- Updated dependencies [19d356b]
  - @segnavia/frame@0.46.0
  - @segnavia/format@0.46.0

## 0.45.0

### Patch Changes

- Updated dependencies [ae3c3e7]
- Updated dependencies [43e786b]
- Updated dependencies [5b151b7]
  - @segnavia/frame@0.45.0
  - @segnavia/format@0.45.0

## 0.44.0

### Patch Changes

- Updated dependencies [39b04fb]
- Updated dependencies [2bfaeb2]
- Updated dependencies [ab876ef]
- Updated dependencies [e222d0b]
- Updated dependencies [5a64fcc]
- Updated dependencies [1e4aada]
- Updated dependencies [70ceccb]
  - @segnavia/format@0.44.0
  - @segnavia/frame@0.44.0

## 0.43.0

### Patch Changes

- Updated dependencies [0a67036]
- Updated dependencies [a039f61]
- Updated dependencies [9501964]
- Updated dependencies [4f77670]
  - @segnavia/frame@0.43.0
  - @segnavia/format@0.43.0

## 0.42.0

### Minor Changes

- 30ed75c: Move Mermaid drawing into the optional `@segnavia/diagrams` package behind a provider seam.

  Hosts that draw diagrams in their own bundle add `import '@segnavia/diagrams/auto'`, or call `registerDiagramProvider(diagrams)`.

### Patch Changes

- Updated dependencies [7551f97]
- Updated dependencies [30ed75c]
  - @segnavia/frame@0.42.0
  - @segnavia/format@0.42.0

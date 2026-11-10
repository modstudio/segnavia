# @segnavia/diagrams

## 0.55.0

### Patch Changes

- Updated dependencies [9d871c5]
- Updated dependencies [4467aa3]
- Updated dependencies [49a3ef0]
- Updated dependencies [ade7a55]
- Updated dependencies [73acc54]
  - @segnavia/format@0.55.0
  - @segnavia/frame@0.55.0

## 0.54.0

### Patch Changes

- Updated dependencies [24c5777]
- Updated dependencies [c2e0bbb]
- Updated dependencies [a98274d]
- Updated dependencies [9fb55dd]
- Updated dependencies [dd8cf59]
  - @segnavia/format@0.54.0
  - @segnavia/frame@0.54.0

## 0.53.0

### Patch Changes

- 56bb43a: Include each package's changelog in its published tarball.
- Updated dependencies [370e995]
- Updated dependencies [3d69490]
- Updated dependencies [b44a38d]
- Updated dependencies [d90ef76]
- Updated dependencies [30bd6b7]
- Updated dependencies [56bb43a]
- Updated dependencies [b5cde83]
- Updated dependencies [7f5ed55]
- Updated dependencies [7cade3b]
- Updated dependencies [41c3b46]
- Updated dependencies [1bd389b]
- Updated dependencies [358b110]
- Updated dependencies [252b705]
- Updated dependencies [6b4d309]
- Updated dependencies [c202b83]
- Updated dependencies [25f56a9]
- Updated dependencies [1bd389b]
- Updated dependencies [dfbbb55]
- Updated dependencies [c775264]
- Updated dependencies [b157cf9]
  - @segnavia/format@0.53.0
  - @segnavia/frame@0.53.0

## 0.52.0

### Patch Changes

- Updated dependencies [719d636]
  - @segnavia/format@0.52.0
  - @segnavia/frame@0.52.0

## 0.51.0

### Patch Changes

- Updated dependencies [dc433bb]
- Updated dependencies [2564247]
- Updated dependencies [355e4fb]
- Updated dependencies [ba2b416]
- Updated dependencies [1395b57]
- Updated dependencies [9d16f46]
- Updated dependencies [498edfc]
- Updated dependencies [5a1a73f]
- Updated dependencies [92717bd]
- Updated dependencies [b5b5cee]
- Updated dependencies [28ecd63]
- Updated dependencies [8ae6b29]
- Updated dependencies [e5b86f8]
- Updated dependencies [22c3521]
- Updated dependencies [fefb30e]
- Updated dependencies [b44900a]
- Updated dependencies [c72645f]
  - @segnavia/format@0.51.0
  - @segnavia/frame@0.51.0

## 0.50.0

### Patch Changes

- Updated dependencies [8f84d79]
- Updated dependencies [6ac32e4]
- Updated dependencies [2df0afb]
  - @segnavia/frame@0.50.0
  - @segnavia/format@0.50.0

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

# @segnavia/diagrams

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

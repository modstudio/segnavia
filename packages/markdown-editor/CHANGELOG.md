# @segnavia/markdown-editor

## 0.44.0

### Patch Changes

- Updated dependencies [39b04fb]
- Updated dependencies [2bfaeb2]
- Updated dependencies [ab876ef]
- Updated dependencies [4111b91]
- Updated dependencies [e222d0b]
- Updated dependencies [5a64fcc]
- Updated dependencies [1e4aada]
- Updated dependencies [70ceccb]
  - @segnavia/format@0.44.0
  - @segnavia/html@0.44.0
  - @segnavia/frame@0.44.0

## 0.43.0

### Minor Changes

- a039f61: Properties set on an element before its definition loads now take effect. Frame also adds the `@segnavia/frame/element-properties` entry.
- 9501964: Add opt-in Vue 3.5 template types for every public custom element prop and event.

### Patch Changes

- Updated dependencies [0a67036]
- Updated dependencies [817cfb2]
- Updated dependencies [a039f61]
- Updated dependencies [9501964]
- Updated dependencies [4f77670]
  - @segnavia/frame@0.43.0
  - @segnavia/html@0.43.0
  - @segnavia/format@0.43.0

## 0.42.0

### Minor Changes

- 7551f97: Move the Markdown editor into the optional `@segnavia/markdown-editor` package.

  Hosts that used `@segnavia/frame/markdown-editor` install `@segnavia/markdown-editor` and its peers and import from it. `@segnavia/react/markdown-editor` keeps its path but now needs `@segnavia/markdown-editor` installed.

### Patch Changes

- Updated dependencies [7551f97]
- Updated dependencies [30ed75c]
  - @segnavia/frame@0.42.0
  - @segnavia/format@0.42.0
  - @segnavia/html@0.42.0

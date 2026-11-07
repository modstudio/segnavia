# @segnavia/markdown-editor

## 0.49.0

### Migrating from 0.48

See the `@segnavia/format` 0.49.0 changelog for what to change in stored documents and host calls.

### Patch Changes

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
  - @segnavia/html@0.49.0

## 0.48.0

### Patch Changes

- Updated dependencies [ed0f315]
- Updated dependencies [8d1c362]
- Updated dependencies [e25fc69]
  - @segnavia/format@0.48.0
  - @segnavia/frame@0.48.0
  - @segnavia/html@0.48.0

## 0.47.0

### Patch Changes

- Updated dependencies [6ef773e]
- Updated dependencies [b9754e3]
- Updated dependencies [100d32f]
- Updated dependencies [1b85f5e]
  - @segnavia/format@0.47.0
  - @segnavia/html@0.47.0
  - @segnavia/frame@0.47.0

## 0.46.0

### Minor Changes

- d6fd8e6: Replace raw-inline native tooltips with accessible names and a host tooltip indication event.

### Patch Changes

- 2eb686f: Keep recorded Markdown source forms when rich mode serializes an edited block.
- Updated dependencies [19d356b]
  - @segnavia/frame@0.46.0
  - @segnavia/format@0.46.0
  - @segnavia/html@0.46.0

## 0.45.0

### Minor Changes

- fdb7478: Keep opaque inline Markdown, footnotes, and loose lists intact when rich-mode blocks are edited.

### Patch Changes

- da55b7e: Normalize CRLF and CR line endings when hosts set Markdown.
- 79cbbec: Align rich task-list checkboxes with their paragraph text.
- Updated dependencies [ae3c3e7]
- Updated dependencies [43e786b]
- Updated dependencies [5b151b7]
  - @segnavia/frame@0.45.0
  - @segnavia/format@0.45.0
  - @segnavia/html@0.45.0

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

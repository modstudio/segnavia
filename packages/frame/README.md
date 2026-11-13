# @segnavia/frame

`@segnavia/frame` provides the controller, headless and styled custom elements, browser printing, and server-safe document builders for viewing and authoring documents. A host uses the entries that match its surface, from an unstyled page or deck stage to a complete player or document editor.

The deck accepts `resolveSlide` for host resolution of a slide's content and `css` for host styling.

Placement-capable surfaces use `placements.resolve` to ask the host for placed assets.

Printing accepts `inline` to let the host turn a slide image path into loadable content.

See the [architecture guide](../../docs/architecture.md) for the full design.

## Entry points

<!-- segnavia:entries -->
| Entry point | Runtime |
|---|---|
| `@segnavia/frame` | browser |
| `@segnavia/frame/deck` | browser |
| `@segnavia/frame/deck-model` | universal |
| `@segnavia/frame/page` | browser |
| `@segnavia/frame/printed-pages` | browser |
| `@segnavia/frame/svg` | universal |
| `@segnavia/frame/timeline` | universal |
| `@segnavia/frame/bridge` | universal |
| `@segnavia/frame/diagrams` | universal |
| `@segnavia/frame/layout` | universal |
| `@segnavia/frame/image-fit` | universal |
| `@segnavia/frame/stage-layout` | universal |
| `@segnavia/frame/print-document` | universal |
| `@segnavia/frame/printed-page-document` | universal |
| `@segnavia/frame/book-document` | universal |
| `@segnavia/frame/composer` | universal |
| `@segnavia/frame/motifs` | universal |
| `@segnavia/frame/fonts` | universal |
| `@segnavia/frame/styled-elements` | universal |
| `@segnavia/frame/headless-elements` | universal |
| `@segnavia/frame/element-properties` | universal |
| `@segnavia/frame/vue` | types only |
| `@segnavia/frame/vue-types` | types only |
| `@segnavia/frame/player` | browser |
| `@segnavia/frame/controls` | browser |
| `@segnavia/frame/authoring` | browser |
| `@segnavia/frame/document-authoring` | browser |
| `@segnavia/frame/board-editing` | browser |
| `@segnavia/frame/item-settings` | browser |
| `@segnavia/frame/local-fonts` | browser |
| `@segnavia/frame/icons` | universal |
| `@segnavia/frame/browser/headless` | browser |
| `@segnavia/frame/browser/controls` | browser |
| `@segnavia/frame/browser/player` | browser |
<!-- /segnavia:entries -->

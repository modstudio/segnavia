# @segnavia/render

`@segnavia/render` turns decks, pages, books, and proofs into offline PDF or image output on a server. A host uses it when output must be composed in an isolated browser, bounded by explicit limits, and optionally prepared for print production.

The host implements `assets` to answer approved document requests; `limits.assets` bounds each answer and their combined bytes.

## Folder fonts

Use `directoryFontSource(catalog, { root })` when a catalog's face `src` values name files beneath one server directory. It refuses absolute paths, parent and symbolic-link escapes, missing paths, and non-regular files. Loaded families are cached for the lifetime of the source, with default bounds of 16 MiB per face and 32 MiB per family; pass `limits: { each, bytes }` to set host bounds.

Pass the same catalog to `urlFontSource` for a browser-preview host and to `directoryFontSource` for server rendering when the two environments expose the same font files differently. Both produce the same `FontSource` face descriptions.

See the [architecture guide](../../docs/architecture.md) for the full design.

## Entry points

<!-- segnavia:entries -->
| Entry point | Runtime |
|---|---|
| `@segnavia/render` | server |
<!-- /segnavia:entries -->

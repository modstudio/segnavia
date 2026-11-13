# @segnavia/render

`@segnavia/render` turns decks, pages, books, and proofs into offline PDF or image output on a server. A host uses it when output must be composed in an isolated browser, bounded by explicit limits, and optionally prepared for print production.

The host implements `assets` to answer approved document requests; `limits.assets` bounds each answer and their combined bytes.

See the [architecture guide](../../docs/architecture.md) for the full design.

## Entry points

<!-- segnavia:entries -->
| Entry point | Runtime |
|---|---|
| `@segnavia/render` | server |
<!-- /segnavia:entries -->

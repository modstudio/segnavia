# @segnavia/render

`@segnavia/render` turns decks, pages, books, and proofs into offline PDF or image output on a server. A host uses it when output must be composed in an isolated browser, bounded by explicit limits, and optionally prepared for print production.

The host implements `assets` to answer approved document requests; `limits.assets` bounds each answer and their combined bytes.

Use `renderer.stampPdf(bytes, { watermark, protection })` to apply the same watermark and PDF protection model to a PDF supplied by the host. Its image watermark uses the same offline `origins`, `assets` and `assetBudget` seam as the render methods. A text watermark uses `watermark.font`, then the first family in `fonts`, then `sans-serif`. Received files and decoded object streams are bounded by host-only `limits.input.bytes` and `limits.input.streamBytes`. The renderer stays offline and never follows external references in the PDF. Stamping changes the file, so an original digital signature no longer validates.

See the [architecture guide](../../docs/architecture.md) for the full design.

## Entry points

<!-- segnavia:entries -->
| Entry point | Runtime |
|---|---|
| `@segnavia/render` | server |
<!-- /segnavia:entries -->

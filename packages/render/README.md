# @segnavia/render

`@segnavia/render` turns decks, pages, books, and proofs into offline PDF or image output on a server. A host uses it when output must be composed in an isolated browser, bounded by explicit limits, and optionally prepared for print production.

The host implements `assets` to answer approved document requests; `limits.assets` bounds each answer and their combined bytes.

## Command line

The package installs `segnavia-render` for a host that needs one offline PDF render per process. It reads one JSON request from standard input and writes only PDF bytes to standard output:

```sh
env -i PATH="$PATH" SEGNAVIA_CHROMIUM=/path/to/chromium /path/to/node_modules/.bin/segnavia-render < request.json > output.pdf
```

The request is `{ "render": "page" | "pages" | "book" | "deck", "document": ..., "options": ..., "fonts"?: ... }`; `pages` takes an array document. The host itself writes this trusted request: its `options`, including `limits`, carry host authority and must not be accepted directly from an untrusted caller. `options` are the corresponding renderer method's JSON-safe options. A `fonts` catalog also requires `SEGNAVIA_FONTS` to name the directory beneath which its face paths resolve. `SEGNAVIA_CHROMIUM_CONTAINER=1` adds `--no-sandbox`, `--disable-setuid-sandbox`, `--disable-dev-shm-usage` and `--disable-gpu`; use it only when rendering inside a container.

Success exits 0 with an empty standard error. A refusal exits 2 with one JSON line on standard error under `refusal`; another failure exits 1 with one line under `failure`. The command accepts at most 100 MiB on standard input. Function seams such as assets, brands, reports and hooks are unavailable, and rendering remains offline.

Use `renderer.stampPdf(bytes, { watermark, protection })` to apply the same watermark and PDF protection model to a PDF supplied by the host. Its image watermark uses the same offline `origins`, `assets` and `assetBudget` seam as the render methods. A text watermark uses `watermark.font`, then the first family in `fonts`, then `sans-serif`. Received files and decoded object streams are bounded by host-only `limits.input.bytes` and `limits.input.streamBytes`. The renderer stays offline and never follows external references in the PDF. Stamping changes the file, so an original digital signature no longer validates.

## Folder fonts

Use `directoryFontSource(catalog, { root })` when a catalog's face `src` values name files beneath one server directory. It refuses absolute paths, parent and symbolic-link escapes, missing paths, and non-regular files. A collection face names the face to extract with `postscriptName`. Loaded families are cached for the lifetime of the source, with default bounds of 16 MiB per face and 32 MiB per family; pass `limits: { each, bytes }` to set host bounds.

Pass the same catalog to `urlFontSource` for a browser-preview host and to `directoryFontSource` for server rendering when the two environments expose the same font files differently. Both produce the same `FontSource` face descriptions.

See the [architecture guide](../../docs/architecture.md) for the full design.

## Entry points

<!-- segnavia:entries -->
| Entry point | Runtime |
|---|---|
| `@segnavia/render` | server |
<!-- /segnavia:entries -->

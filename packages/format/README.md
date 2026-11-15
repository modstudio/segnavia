# @segnavia/format

`@segnavia/format` defines the validated document model, shared values, and JSON Schema used across the library. A host uses it to parse documents at its boundaries and to exchange the same typed model with viewing, editing, and rendering packages.

The host implements `BrandSource` when documents may name a brand whose style sheet must be resolved.

## Font sources

Define app fonts once in a `FontCatalog`, then use `urlFontSource` when their `src` values are absolute URLs or are relative to a `baseUrl`. URL fonts are fetched by the host process and cached for the lifetime of that source; they are embedded as data for browser preview and never fetched by Chromium. `catalogFontSource` adapts another byte loader, and `fontSources(...sources)` asks sources in order until one knows the requested app-font name. A rejected load is not cached.

Each source defaults to 16 MiB per face and 32 MiB per family. Override those bounds with `limits: { each, bytes }` when the host has a different bounded policy.

See the [architecture guide](../../docs/architecture.md) for the full design.

## Entry points

<!-- segnavia:entries -->
| Entry point | Runtime |
|---|---|
| `@segnavia/format` | universal |
<!-- /segnavia:entries -->

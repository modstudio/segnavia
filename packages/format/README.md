# @segnavia/format

`@segnavia/format` defines the validated document model, shared values, and JSON Schema used across the library. A host uses it to parse documents at its boundaries and to exchange the same typed model with viewing, editing, and rendering packages.

The host implements `BrandSource` when documents may name a brand whose style sheet must be resolved.

See the [architecture guide](../../docs/architecture.md) for the full design.

## Entry points

<!-- segnavia:entries -->
| Entry point | Runtime |
|---|---|
| `@segnavia/format` | universal |
<!-- /segnavia:entries -->

# @segnavia/idml

`@segnavia/idml` inspects IDML package bytes and converts supported stories, styles, masters, tables, and artwork into a validated book-kind `Document`. A host uses it to present structural conversion questions, supply font and linked-art mappings, and import the resolved result without network access. `importIdml` returns that document with its import report.

See the [architecture guide](../../docs/architecture.md) for the full design.

## Entry points

<!-- segnavia:entries -->
| Entry point | Runtime |
|---|---|
| `@segnavia/idml` | universal |
<!-- /segnavia:entries -->

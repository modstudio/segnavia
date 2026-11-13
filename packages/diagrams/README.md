# @segnavia/diagrams

`@segnavia/diagrams` supplies the optional offline Mermaid layout provider and its drawing script. A host uses it when authored Markdown or HTML documents contain Mermaid placeholders, either by registering the provider or importing the automatic browser entry.

See the [architecture guide](../../docs/architecture.md) for the full design.

## Entry points

<!-- segnavia:entries -->
| Entry point | Runtime |
|---|---|
| `@segnavia/diagrams` | universal |
| `@segnavia/diagrams/script` | universal |
| `@segnavia/diagrams/auto` | browser |
<!-- /segnavia:entries -->

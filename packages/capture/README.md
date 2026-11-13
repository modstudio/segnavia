# @segnavia/capture

`@segnavia/capture` runs scripted browser flows and produces clean or annotated screenshots. A host uses it when repeatable captures need host-controlled sessions, navigation, and flow helpers.

The host implements the `Host` seam to open a capture session and supply its browser context and flow integration.

See the [architecture guide](../../docs/architecture.md) for the full design.

## Entry points

<!-- segnavia:entries -->
| Entry point | Runtime |
|---|---|
| `@segnavia/capture` | server |
<!-- /segnavia:entries -->

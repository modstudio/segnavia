# @segnavia/voice

`@segnavia/voice` produces narration audio and word timings, with deterministic pacing and optional caching. A host uses it to connect a speech service or local engine to the narration model while keeping provider credentials and storage under host control.

The host implements `VoiceProvider` directly, or supplies speech and alignment functions through `alignedProvider`.

See the [architecture guide](../../docs/architecture.md) for the full design.

## Entry points

<!-- segnavia:entries -->
| Entry point | Runtime |
|---|---|
| `@segnavia/voice` | server |
<!-- /segnavia:entries -->

# Roadmap

## To make it a project

1. Claim the npm scope and complete the one-time npm setup for each package.

## To make it complete for the current hosts

Every requirement not yet verified end to end needs that check. Three come
first:

- **Call ElevenLabs for real** with a key from the host's secret store, and
  check the timings against the audio.
- **Hear real browser voices** for live narration, in each language a host
  needs.
- **Measure the JS heap cap and exact print colours**, which are set but not
  yet measured.

Then adopt, in this order: the first capture host (the capture adapter, then
geometry on the version and `PublishedShot`), then a host that needs the
renderer and bindings (then the deck viewer), then one that needs the deck
viewer and printing.

## Designed but not built

| Feature | Notes |
|---|---|
| A Kokoro adapter for a locally hosted voice | `alignedProvider` is the seam. It needs a speech endpoint and an aligner. |
| Streaming speech | ElevenLabs offers a streaming timestamps endpoint, which a clock can read as it arrives. |
| Export to video | The timeline is pure, so an exporter can step it frame by frame and record the viewer. |
| A live app in a slide, driven by a script | devreel's approach: a `url` slide plus scripted actions on a timeline, reusing capture's targets. |
| Authoring surfaces | Editors stay in each host. A shared editor is a separate decision. |

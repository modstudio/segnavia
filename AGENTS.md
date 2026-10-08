# Working in this repository

These rules hold for every change. Where a check enforces a rule, the rule is
stated once and the check is named.

## What this is

A library, not an app. It serves every host alike: code never names a host
product (`scripts/checks/rules.ts`, `checkHostNames`, with names from
`host-names.local`), and what a host owns
(storage, sharing, tickets, tenancy, its own UI) stays in the host. A
host-specific need becomes a parameter, a hook or a host adapter, never a
branch on who is calling. Adoption notes for a named host belong with that
host, never in this repository.

## The library owns its seams

A seam is declared here and implemented by a host: `Host` in capture,
`resolveSlide` and `css` on the deck, `inline` for printing, `VoiceProvider`
and `alignedProvider` for voice. A host conforms to a seam; a seam is never
shaped around one host. When a need does not fit an existing seam, design the
seam first and write it into `docs/architecture.md`.

## Packages and imports

`architecture.ts` is the manifest: each package's runtime and what it may
import. `scripts/checks/rules.ts` (`checkImports`, `checkManifest`) enforces
it, including that `package.json` and the manifest agree. Its rules:

- A universal package (`format`, `html`) runs in a browser and on a server, so
  it uses no Node built-in and no Node global.
- A workspace package is reached only through an entry point its
  `package.json` exports, never by a path into its `src/`.
- `frame` is for the browser, but its declared server-safe entry points
  (`svg`, `timeline`, `bridge`, `print-document`) never reach a browser-only
  file. Server code imports those, never the element.
- A boundary that is not in `architecture.ts` is not a boundary. Add the rule
  there before relying on it.

## Code

- Policy is a pure function over plain values. An adapter gathers facts and
  applies the decision. The timeline, geometry, bindings, sanitizer, limits
  and paper maths are pure, and their tests sit beside them.
- Validate once, at the edge: `Deck.parse` and `Page.parse` where input
  arrives, typed values inside.
- A refusal names what it could not establish and what clears it.
- Biome owns formatting and lint (`biome.json`). Configure a rule there;
  never suppress it inline. Cognitive complexity is capped there too.
- A source file stops at `FILE_CEILING_LINES` (`architecture.ts`). Split out
  a concern rather than raising the ceiling.

## Headless first

The controller, stage and page elements bring no appearance. A style they
need is geometry, in `BASE_CSS`, inside `:where()`; colours are
`--segnavia-*` custom properties with plain defaults
(`base-style.test.ts`). Appearance belongs in the styled components
(`@segnavia/frame/controls`) and the player built from them, never in the
headless layers. The player adds layout only: a look it needs belongs in a
component, so the two never differ.

## Bidirectional text

Text the library writes or lays out takes its own direction: logical CSS
properties only (`inline`, `block`, `start`, `end`), library-written text
isolated, direction resolved by `resolveDirection` from `dir`, then `lang`,
then the first strong letter. A new place that shows text says how it
handles direction.

## Security invariants

- Author HTML is always shown in a frame sandboxed without same-origin.
  Under `scripts: 'refuse'` a nonce CSP keeps author scripts from running
  while the bridge still runs. Never add `allow-same-origin`.
- A message from a frame is trusted only by `event.source`, never by
  `origin` (`messageFrom`). The bridge relays a key's name, a height and a
  ready signal, never anything else.
- Rendering is offline. Never let a render reach the network.
- No secret is stored. A provider reads its key from the host at the moment
  of use (`elevenLabsProvider({ apiKey: () => ... })`), never at import.

## Comments and docs

A comment states what the code does now and why. It never narrates history
and never cites a tracker key (`checkComments`). Docs describe the current
design; git keeps the record of how it changed.

## Tests

A test earns its standing cost: it fails on a subtle defect whose cost
justifies it. Unit tests run in process, spawn nothing, and sit beside their
module as `<module>.test.ts`. A browser belongs to `bun run demo`, which plays
the deck in Chromium and checks what is on screen; it is not part of the gate.

## Commits

- The pre-commit hook runs `bun run check`. A failed check means the commit
  did not happen: fix it and commit again. Never pass `--no-verify`.
- The subject is `<KEY>-<n> <Imperative sentence>`, with no type prefix
  (`.githooks/commit-msg`). The key's prefix is the one in
  `.githooks/key-prefix`, which the project's tracker assigned.
- No AI attribution in a message (`.githooks/commit-msg`).
- Every task, branch and commit carries its key.

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

## Model before branching

Behavior follows from a model of the real thing; outcomes are computed from
it, never special-cased. Every conditional that picks a behavior raises a
question: what fact does this branch stand for, and where does that fact
belong in the model? Usually the answer moves the branch into data: a field,
a setting, a computed value, a table.

When several conditions combine, step back before writing them. Name the
dimensions the cases vary along, write out the matrix of their combinations,
and model the dimensions, so the code reads the model instead of listing
cases. A note's numbering and its placement are two settings, not two kinds
of note; a document variant is a selection over named parts, not a set of
toggles. A branch that resists being modeled means a concept is missing:
find it rather than hard-coding the case.

## Design research

A design starts with research into how others meet the same need: layout
engines, typesetting systems, paged-media renderers and design platforms
such as InDesign. The research is for ideas, and for the problems those
tools ran into. It is not a template. The design is our own: what this
library builds may exist nowhere else, and its model follows from the real
thing, never from another tool's API. The design names what each source
suggested and whether we took it.

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
need is geometry, in `BASE_CSS`, inside `:where()`; colors are
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

Hebrew books and seforim are a first-class use, not a localization. Their conventions are requirements a general layout tool misses, so a feature that numbers, notes or paginates text is designed and tested for them from the start (Design direction, in the doc store).

## Security invariants

- Author HTML is always shown in a frame sandboxed without same-origin. A
  scripted frame adds `allow-forms` under `form-action 'none'`; a refused-script
  frame does not. Under `scripts: 'refuse'` a nonce CSP keeps author scripts
  from running while the bridge still runs. Never add `allow-same-origin`.
- A message from a frame is trusted only by `event.source`, never by
  `origin` (`messageFrom`). The bridge relays exactly a key's name, a height,
  a ready signal, an animation report, a bounded slot-fit report and, from a
  paginated book frame, a bounded `segnavia:book-place` report: a position key
  parsed by the book model and at most 256 characters. The host checks
  selection replies against a size bound. A refused-script page answers exactly two inbound message
  types from its parent: a selection request, and `segnavia:book-layout` in a
  paginated book frame. The book-layout message is accepted only when `layout`
  is exactly `pages` or `flow` and `place` is absent or obeys that same bound.
  Slot fit is safe because filled items refuse author scripts, leaving only
  the nonce-authorized bridge able to post from a filled frame.
- Rendering is offline: Chromium never reaches the network. A scripted document's approved dependencies are answered from the host's cache, and anything else is refused.
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

- The pre-commit hook runs `bun run check --changed --staged`. A failed check
  means the commit did not happen: fix it and commit again. Never pass
  `--no-verify`. The full `bun run check` runs in CI.
- The subject is `<KEY>-<n> <Imperative sentence>`, with no type prefix
  (`.githooks/commit-msg`). The key's prefix is the one in
  `.githooks/key-prefix`, which the project's tracker assigned.
- No AI attribution in a message (`.githooks/commit-msg`).
- Every task, branch and commit carries its key.

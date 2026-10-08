# Segnavia

Segnavia holds **pages**, **slides** and **decks** as self-contained HTML, shows them in
any web app (headless, or with an optional finished skin), prints them, and lets a slide **play**: narration sets its pace,
and annotations measured on a real app's screens appear as the words that
name them are spoken.

A deck mixes static slides with slides that play. Nothing is compiled into a
video. The images, the narration and the timings stay separate, so a
recaptured screen, an edited sentence or a re-voiced line changes only itself.

> **Status: proof of concept.** `docs/roadmap.md` lists what comes next. Treat
> the API as unstable until a first release.

## What it does

| Need | Package |
|---|---|
| The shared shapes: page, slide, deck, narration, cue, shot, manifest, plus JSON Schema for hosts that do not run TypeScript | `@segnavia/format` |
| The active-content rule for authored HTML, and attribute bindings that fill a page from data with no script | `@segnavia/html` |
| Headless viewing: `DeckController` (paging, play, cues, keys, prefetch) with `<segnavia-stage>` and `<segnavia-page>`, which bring no appearance; printing from the browser | `@segnavia/frame` |
| Styled components to place beside your own UI: `<segnavia-play>`, `-step`, `-track`, `-counter`, `-caption`, `-notes`, `-fullscreen` | `@segnavia/frame/controls` |
| A finished player, a layout of those components: `<segnavia-player>` | `@segnavia/frame/player` |
| Pages, slides and decks to PDF or PNG/WebP/JPEG, offline, at their own size or on paper | `@segnavia/render` |
| Scripted capture of a real app: flows, steps, shots, measured annotations, clean and annotated images | `@segnavia/capture` |
| Narration text to words with timings, and audio: ElevenLabs, any engine plus an aligner, or a paced offline timing | `@segnavia/voice` |

## Quick look

Four ways to use it, from bare to finished:

| | Load | You get |
|---|---|---|
| Completely headless | `@segnavia/frame` | `<segnavia-stage unstyled>`: no styles at all; `BASE_CSS` is exported if you want a starting point |
| Headless | `@segnavia/frame` | `<segnavia-stage>`: geometry only, at zero specificity |
| Styled components | `@segnavia/frame/controls` | finished pieces you place beside your own controls, themed by `--segnavia-*` and your `color-scheme` |
| Finished player | `@segnavia/frame/player` | `<segnavia-player>` as it is |

Use the finished player as it is:

```html
<script type="module" src="segnavia-player.js"></script>
<segnavia-player src="deck.json" notes theme="auto"></segnavia-player>
```

The published `@segnavia/frame/browser/headless`, `/browser/controls` and
`/browser/player` files are self-contained browser bundles. Controls include
the headless elements, and the player includes both earlier layers, so a page
loads exactly one of them.

Mix your own controls with styled ones:

```html
<script type="module" src="segnavia-controls.js"></script>
<segnavia-stage id="stage" src="deck.json"></segnavia-stage>
<segnavia-caption for="stage"></segnavia-caption>
<segnavia-play for="stage"></segnavia-play> <button>Your own</button> <segnavia-track for="stage"></segnavia-track>
```

Or draw every control yourself, on the headless stage:

```js
import '@segnavia/frame'              // defines <segnavia-stage> and <segnavia-page>; no skin
const stage = document.querySelector('segnavia-stage')   // <segnavia-stage src="deck.json">
const controller = stage.controller
controller.addEventListener('change', ({ detail: state }) => render(state))   // index, playing, word, shown, progress, direction
nextButton.onclick = () => controller.next()
```

Render it on a server:

```ts
import { openRenderer } from '@segnavia/render'

const renderer = await openRenderer({ executablePath: '/usr/bin/chromium', concurrency: 2 })
const pdf = await renderer.deckPdf(deck, { layout: 'notes', limits: { maxSheets: 600 } })
```

Capture an app through its own adapter:

```ts
import { capture } from '@segnavia/capture'

await capture(myHost, myFlows, {
  baseUrl: 'http://localhost:8000',
  outputDirectory: 'shots',
  executablePath: '/usr/bin/chromium',
  output: { format: 'webp', quality: [90, 80, 70], maxBytes: 5_242_880, annotated: true },
})
```

`fixtures/demo-app/` is a complete host: a small app, its adapter and its
flows. `scripts/build-demo.ts` takes it through every package.

## Working on it

```bash
bun install
bun run setup      # point git at the tracked hooks
bun run build      # build every package and the three self-contained browser bundles
bun run check      # the gate: rules, Biome, types, tests, builds and packed-package shape
bun run setup:php  # the PHP host fixture's validator, once
bun run demo       # capture, narrate, build and render; then check it in Chromium, under Bun and Node, and from PHP
```

`SEGNAVIA_CHROMIUM` names the browser binary for the demo.
Repository commands go through `bun run`, which enables workspace source
resolution and refuses stale built output.

The pre-commit hook runs `bun run check`. The commit-msg hook refuses AI
attribution and a subject without the project's task key, whose prefix is in
`.githooks/key-prefix`. `AGENTS.md` holds the rules every change follows.

## Documentation

- [`docs/vocabulary.md`](docs/vocabulary.md): the words the API uses and the ones it avoids
- [`docs/architecture.md`](docs/architecture.md): packages, runtimes, seams and data flow
- [`docs/decisions.md`](docs/decisions.md): what was decided and why
- [`docs/research.md`](docs/research.md): what exists elsewhere, including negative results
- [`docs/roadmap.md`](docs/roadmap.md): what is next, and what is designed but not built

## Licence

MIT. See [`LICENSE`](LICENSE).

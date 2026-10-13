# Architecture

## Packages

```
format  ◄── html          (universal: browser and server)
  ▲
  ├── frame               (browser; svg, timeline, bridge and print-document are server-safe)
  │     ▲
  │     ├── render        (server: Chromium via playwright-core, pdf-lib)
  │     │     ▲
  │     └─────┴── capture (server: flows, shots, annotations)
  └── voice               (server: providers, cache)
```

Inside `frame` there are three layers. A host takes the first two, or all three:

| Layer | What it is | Appearance |
|---|---|---|
| `DeckController` | All behaviour: slides, play, clocks, cues, keys in reading direction, `#slide-N`, prefetch, `resolveSlide`. Events: `change`, `slide`, `cue`, `error`, `end`, `exit`. Its clock and scheduler can be swapped, so the gate tests it. | None: it renders nothing. |
| `<segnavia-stage>`, `<segnavia-page>` | Light DOM elements that show one slide or page in a sandboxed frame, scaled to the box the host gives them. | Only geometry, in `BASE_CSS`, every rule inside `:where()` with zero specificity. Colours are custom properties with plain defaults. |
| Styled components (`@segnavia/frame/controls`) | `<segnavia-play>`, `<segnavia-step>`, `<segnavia-track>`, `<segnavia-counter>`, `<segnavia-caption>`, `<segnavia-notes>`, `<segnavia-fullscreen>`: each a finished piece connected by `for`, `controller` or the nearest ancestor. | Their own, each in a shadow root. Every colour reads a `--segnavia-*` property first and falls back to `light-dark()`, so a host's accent and `color-scheme` reach them. |
| `<segnavia-player>` (`@segnavia/frame/player`) | The finished player: a layout of the styled components around a stage, with notes, full screen and translatable labels. | Its layout, plus the components' look; `theme` sets its `color-scheme`. |

`unstyled` on the stage or page drops even the geometry, for a host that lays them out itself.

`architecture.ts` declares each package's runtime and imports, and
`bun run check` enforces it. `format` and `html` run anywhere. `frame` defines
the custom elements, but its server-safe entry points are the single source
of the frame document, the annotation drawing, the timeline and the print
document. That way a browser and a server produce the same bytes.

The six packages are built as ESM JavaScript and declarations with tsdown;
their tsdown platform comes from each package's runtime in `architecture.ts`.
Installed hosts resolve package exports to `dist`. Repository commands pass
the `@segnavia/source` export condition, also configured for TypeScript, so
Bun and Node resolve workspace imports directly to `src` while developing.

## The seams

The library declares every seam, and hosts implement them. Nothing in the
library names a host.

| Seam | Where | What the host supplies |
|---|---|---|
| `Host` and `HostSession` | `capture/src/host.ts` | Session setup (`context`, `contextFor(flow)`), CSS to hide account details, per-flow `extras` (an API client, seeded data, a CLI bridge), `beforeNavigate` (wait for capacity), `observe` (watch responses), `refuseShot` (veto a broken screen), `close`. |
| `resolveSlide` | `DeckController` option and property; `<segnavia-player>` property | Content minted when a slide is shown: a single-use ticket URL, a signed image, a fresh shot. |
| `css`, `cspExtra` | `<segnavia-stage>`, `<segnavia-page>`, `<segnavia-player>`, render options | House style, and extra CSP directives. |
| `labels` | `<segnavia-player>` | The skin's words, in the host's language. |
| `--segnavia-*` custom properties | stage, page and player | Colours, radius, type, annotation colour, cue fade. |
| `inline` | print options | A way to turn a slide's image path into a data URL for offline rendering. |
| `fonts` | render options | Faces to embed, as bytes. |
| `limits` | render options, `exceedsLimits` | The host's ceilings: sheets, bytes, slides, slide size, notes size. |
| `Imposition` (designed, not built) | print and render options | The paper and grid of the host's label stock, card or folded piece. |
| `VoiceProvider`, `alignedProvider` | `voice` | A speech engine and, where it gives no timings, an aligner. |
| `prefix`, `linkOrigins` | `html` | The bindings attribute prefix, and the https origins a link may point at. |

## How a deck plays

1. The deck is parsed with `Deck.parse`, which refuses a cue naming a word or
   annotation that does not exist and a slide id used twice.
2. For each slide shown, the controller runs `resolveSlide` if it is set. A `shot-ref` is
   fetched as a `PublishedShot`, cached per address, and resolved relative to
   that address.
3. HTML goes into a frame through `frameDocument`. The CSP and the bridge
   come first, before anything the author wrote. Under `scripts: 'refuse'`
   the policy admits only the bridge's nonce.
4. A playing slide gets a clock. `timedClock` uses audio when there is some
   and falls back to the narration's own timing if playback is refused.
   `speechClock` uses the browser's voices for a live narration. On each
   frame the deck asks the clock for the current word, and `annotationsAt`
   decides which annotations show. The stage and any host controls draw
   from the `change` event.
5. When the clock ends, the controller moves on. Play continues through playing
   slides and stops at a static one.

## Bidirectional text

Every place the library writes or lays out text follows the text's own
direction:

- **Blocks in a frame** take the direction of their first strong letter
  (`BLOCK_DIRECTION_CSS`), under the page's `dir`.
- **Filled-in values** are isolated (`dir="auto"`), so a value in one
  direction cannot reorder the sentence around it.
- **Captions** follow the narration's `dir`, else its `lang`, else its text.
  Each word is its own span, so highlighting never reorders the line.
- **Annotation labels** render in their own direction. **Badges** sit at the
  top corner on the captured app's inline-end side, using the direction
  measured at capture (`Shot.dir`).
- **Paging keys** follow the deck's reading direction (`keyAction`).
- **The skin** uses logical properties throughout, mirrors its icons, and
  isolates the slide counter left to right.
- **Notes** in print take their own direction, inside a document in the
  deck's direction.
- **Paced timing** pauses at Hebrew and Arabic punctuation as at Latin, and
  cue words match without niqqud.

## How a shot is made

1. `capture` launches Chromium, calls `host.open`, and runs each selected
   flow in its own context.
2. `flow.shot` settles the page and measures each annotation's element. A
   target must match exactly one visible element inside the viewport, or the
   flow fails, naming the step and the locator.
3. `layoutAnnotation` turns each box into a ring, badge and arrow.
4. The clean image is written. If asked, the same SVG the viewer draws is
   overlaid to write the annotated rendition.
5. Only a flow that finishes moves its shots out of staging. `manifest.json`
   keeps the latest shot per key, and `report.json` records every flow,
   including where a failure screenshot was saved.

## How pages are printed on paper

A page stays a page: it is laid out as on screen, and everything about paper
is in its print setting or in an imposition. Two parts are built. A page with
a print setting exports on its paper (`pagePdf`), and a deck prints one slide
to each sheet of paper (`printableDeck`). The rest of this section is designed
and not yet built, in the order it will be built.

**Trim, bleed and safe area.** `Print` gains `bleed`, `safe` and `marks`. Its
`paper` is the trim, the finished size after cutting. The page still lays out
inside the trim. Its root background continues through the bleed, and
`--segnavia-bleed` and `--segnavia-safe` give author CSS the two distances, so
a picture can run off the edge and text can stay clear of the cut. `marks`
draws crop marks outside the bleed. The PDF page grows by the bleed and the
marks and carries the trim and bleed boxes, so a print shop's software finds
the cut. This alone makes a postcard: two pages, front and back, in one PDF.

**Imposition.** An `Imposition` places many pages on one paper. It holds a
paper, an orientation, margins, a grid of cells (columns, rows, cell size and
gaps), a bleed for every cell, and how the cells fill: `sequence` puts one
page in each cell in reading order, and `repeat` puts one page in every cell.
`impose` is a pure function in `format`. From an imposition and a number of
pages it returns each page's placement: which paper, which side, and where in
millimetres. It refuses a grid that does not fit its paper, naming the side
that overflows and by how much. A page in a cell is shown at the cell's size
by the rule the stage uses for a slide: a fixed page is scaled to fit, and a
fluid page is laid out at the cell's width. The cell's bleed and safe area
come from the imposition; the page's own print setting is not consulted.

A label template is an imposition: label stock is a grid. The host supplies
the grid of the stock it sells or uses, and the library ships no catalogue of
stock numbers. Filling labels from records is the host's use of bindings,
one page per record.

**Sides.** An imposition may have two sides, flipped on the long or the short
edge. `impose` mirrors the back's placements across the flip, so each back
lands behind its front.

**Folds.** A folded piece is an imposition whose cells are panels: one row,
columns that may differ in width, two sides, and a fold line between columns.
This part is provisional. Its shape is settled once the first three are in
use, and it is done when a letter-fold brochure prints with every panel in
its place on both sides.

One print document serves a browser and a server, as it does for a deck.
`printablePages` builds it from pages and an imposition in `frame`'s
server-safe print entry, `printPages` prints it in a browser, and `pagesPdf`
renders it. The host's `limits` count papers as they count a deck's.

The grid fills in the imposition's reading direction: from the top
inline-start corner, so the first cell of a right-to-left imposition is at
the top right. Each page keeps its own direction inside its cell. Marks carry
no text.

## How a render stays safe

Every render runs in its own context, offline, with requests that leave the
page refused, WebSockets closed and the browser's own sockets sent to a dead
proxy. Author scripts run only when the page or deck allows them. A page that
runs code must call `window.pageReady()`, unless the host passes
`waitForPageReady: false`. Renders are bounded by `RENDER_BOUND_MS`, queued at
the renderer's `concurrency`, and checked against the host's `limits`.

## Data the host keeps

The library keeps no storage. A host stores decks and pages, its shot library
(versions, permanent addresses, usage via `shotsUsed`), tickets, sharing and
tenancy, and serves `PublishedShot` JSON at each shot's address.

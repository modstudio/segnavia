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
| `DeckController` | All behavior: slides, play, clocks, cues, keys in reading direction, exact and clamped `#slide-N` links, neighbor content, reload identity, and in-window presentation. Events: `change`, `slide`, `cue`, `error`, `end`, `exit`. Its clock and scheduler can be swapped, so the gate tests it. | None: it renders nothing. |
| `<segnavia-stage>`, `<segnavia-page>`, `<segnavia-paper>` | Light DOM elements that show one slide, one page, or one paper of imposed pages in sandboxed frames. A stage scales to its box or the available window and can keep its neighboring slides mounted. | Only geometry, in `BASE_CSS`, every rule inside `:where()` with zero specificity. Colors are custom properties with plain defaults. |
| Styled components (`@segnavia/frame/controls`) | `<segnavia-play>`, `<segnavia-step>`, `<segnavia-track>`, `<segnavia-counter>`, `<segnavia-caption>`, `<segnavia-notes>`, `<segnavia-fullscreen>`: each a finished piece connected by `for`, `controller` or the nearest ancestor. | Their own, each in a shadow root. Every color reads a `--segnavia-*` property first and falls back to `light-dark()`, so a host's accent and `color-scheme` reach them. |
| `<segnavia-player>` (`@segnavia/frame/player`) | The finished player: a layout of the styled components around a stage, with notes, full screen and translatable labels. | Its layout, plus the components' look; `theme` sets its `color-scheme`. |

`unstyled` on the stage, page or paper drops even the geometry, for a host that lays them out itself.

`architecture.ts` declares each package's runtime and imports, and
`bun run check` enforces it. `format` and `html` run anywhere. `frame` defines
the custom elements, but its server-safe entry points are the single source
of the frame document, the annotation drawing, the timeline and the print
document. The browser uses that frame-based print layout; the server uses its
geometry while composing top-level renders.

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
| `contentFor` | `DeckController` | Resolved content for a neighbor without navigating; the stage shares the controller's prefetch cache. |
| `css`, `cspExtra` | `<segnavia-stage>`, `<segnavia-page>`, `<segnavia-paper>`, `<segnavia-player>`, render options | House style, and extra CSP directives. |
| `labels`, `frameTitle` | `<segnavia-player>`, `<segnavia-stage>` | The skin's words and the localized frame title. `defaultFrameTitle` supplies the English default, and the position is recomputed after a reorder. |
| `--segnavia-*` custom properties | stage, page, paper and player | Colors, radius, type, annotation color, cue fade. |
| `neighbors` | `<segnavia-stage>` | Whether previous and next frames remain mounted, inert and visually hidden when author scripts are refused. A deck with sandboxed scripts mounts no neighbors because a running author script in a hidden frame could take the page's keyboard focus; on a turn, its incoming frame loads invisibly above the visible frame and replaces it after two parent animation frames. The visible frame and its annotations keep the deck's direction. |
| `keys` | `DeckController` option | `'stage'` for stage-local keys or `'page'` for bounded page-wide arrows and page keys. In page mode, form fields retain arrows and page keys, while Escape still ends an in-window presentation. Arrows follow reading direction. |
| `connectWindow`, `disconnectWindow` | `DeckController` | Resume or suspend the controller's hash and page-key listeners. A disconnected stage suspends a host-owned controller and reconnecting resumes it; a stage-created controller is destroyed. |
| `present`, `stopPresenting`, `presenting`, `data-presenting` | `DeckController` and `DeckState` | The element to present over the window, the exit operation, readable state and the host styling hook. `--segnavia-backdrop` supplies its backdrop. |
| `fit="viewport"`, `reserve`, `fitted`, `segnavia-fit` | `<segnavia-stage>` | Window fitting, fixed block-start and block-end room in CSS pixels, and the resulting scale and size. Inline padding and block edges follow CSS writing direction. |
| `inline` | print options | A way to turn a slide's image path into a data URL for offline rendering. |
| `fonts` | render options | Faces to embed, as bytes. |
| `limits` | render options, `exceedsLimits` | The host's ceilings: PDF pages, bytes, slides, slide size, notes size. |
| `Imposition` | print and render options | The paper, grid, sides and flip of the host's label stock or card; marks and folds are not built. |
| press profile | render options | The ICC profile of the press, as bytes, and a report callback for authored RGB images left unchanged and conversion counts read back from the output. |
| `convert`, proof image, gamut report (designed, not built) | render options | A future hook may supply a full converter for the finished PDF, with a proof and out-of-gamut colors for a host to show. |
| `VoiceProvider`, `alignedProvider` | `voice` | A speech engine and, where it gives no timings, an aligner. |
| `prefix`, `linkOrigins` | `html` | The bindings attribute prefix, and the https origins a link may point at. |

## How a deck plays

1. The deck is parsed with `Deck.parse`, which refuses a cue naming a word or
   annotation that does not exist and a slide id used twice.
2. For each slide shown, the controller runs `resolveSlide` if it is set. `contentFor(index)` does the same without navigating and shares the prefetch cache. A `shot-ref` is
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
5. With `neighbors` and `scripts: 'refuse'`, the stage keys frames by slide id and keeps the selected slide plus its previous and next slide. Hidden neighbors are inert. A turn reveals the already-running neighbor without changing its document. A deck with `scripts: 'sandboxed'` mounts no neighbors because a running author script in a hidden frame could take the page's keyboard focus. On a turn it loads the incoming frame invisibly above the outgoing frame, then swaps after the load event and two parent animation frames; a bounded timeout completes the swap when loading never finishes. A later turn cancels a pending swap and starts from the frame still visible. Reloading a reordered deck keeps the selected id and its frame; removing it keeps the old position, clamped into the new bounds. Reloading replaces a mounted frame when its resolved content, scripts mode, host CSS or extra CSP changes, while keeping the selected id and leaving the address unchanged.
6. A first load reads an exact `#slide-N`, clamped to the deck's bounds. `go`, keys and live hash changes navigate directly and replace the address rather than adding history.
7. In page-key mode, arrows and page keys work outside form fields, Space has no deck action, and Escape ends an in-window presentation. `present(element)` marks the chosen element with `data-presenting`, locks body overflow and uses `--segnavia-backdrop`; `stopPresenting`, stage disconnection and controller destruction restore it. `<segnavia-fullscreen mode="window">` uses this path, while its default remains native fullscreen.
8. `fit="viewport"` scales from the stage's unscaled inline space and `window.innerHeight`, subtracting its block-start edge and `reserve` at both block edges. While presenting it uses the presented element's block size. It reports `{ scale, width, height }` through `fitted` and `segnavia-fit`; window, visual-viewport and stage resizes trigger a new measurement.
9. When the clock ends, the controller moves on. Play continues through playing
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
- **Paging keys** follow the deck's reading direction (`keyAction`), whether they originate on the stage, on the page or through a frame relay.
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
is in its print setting or in an imposition. A host shows a page alone with
`<segnavia-page>` and in an imposition's cells with `<segnavia-paper>`; switching
between them is the host's control. A page with a print setting exports
on its paper (`pagePdf`), its trim, bleed, safe area and crop marks are carried
into that PDF, and a deck lays out one slide on each sheet of its frame-based
print document (`printableDeck`). The `Imposition` value and its arithmetic (`impose` and
`fitPage`) are built in `format`; `printablePages` builds an imposition's print
document for a browser, and `pagesPdf` renders and composes pages onto its
papers. `printPages` prints the imposed papers from the browser, with the known
limit that its print dialog loses backgrounds inside frames; a host that needs
them uses the renderer's `pagesPdf`. Two-sided imposition is built; marks on
an imposed paper and folds are not. The rest of this section remains designed.

**Trim, bleed and safe area.** `Print` has `bleed`, `safe` and `marks`. Its
`paper` is the trim, the finished size after cutting. The page lays out inside
the trim. Its root background continues through the bleed, and
`--segnavia-bleed` and `--segnavia-safe` give author CSS the two distances, so
a picture can run off the edge and text can stay clear of the cut. `marks`
draws crop marks outside the bleed. The PDF page grows by the bleed and the
marks and carries the trim and bleed boxes, so a print shop's software finds
the cut. The two properties are set wherever the page is shown; the bleed is
painted only in a PDF. Viewport units measure the bleed box. With bleed or
marks, a page is one printed piece; content that needs a second paper is
refused. Without them, a page prints as before. A postcard face is one such
page. `pagesPdf` can join several pieces in one PDF without putting them on the
same paper; putting several pages on one paper belongs to imposition.

**Imposition.** An `Imposition` places many pages on one paper. It holds a
paper, an orientation, margins, a grid of cells (columns, rows, cell size and
gaps), a bleed for every cell, and how the cells fill: `sequence` puts one
page in each cell in reading order, and `repeat` puts one page in every cell.
Its lengths are in one unit named once: millimeters, inches or points (72 to
the inch), so a host writes its stock's numbers as the maker gives them. A
custom paper on `Print` takes the same three units. Placements are always in
millimeters. An imposition has at most ten thousand cells on a paper.
`skip` leaves that many cells empty at the start of the first paper, for
label stock that is partly used.
`impose` is a pure function in `format`. From an imposition and a number of
pages it returns each page's placement: which paper, which side, and where in
millimeters. A grid that does not fit its paper is refused when the
`Imposition` is parsed, naming the overflow in millimeters; `impose` returns
placements only. The cell's bleed and safe area come from the imposition,
because the cell is the finished product. `fitPage` reports the scale, bands
`{ inline, block }` and crop `{ top, right, bottom, left }` in millimeters, and
whether the cell differs from the page's own trim. The page's print setting is
used only for that comparison, not to set the cell's geometry.

When a fixed page and its cell differ in shape, the imposition's `fit`
decides. `contain`, the default, shows the whole page centered and leaves
bands on two sides. `cover` fills the cell and its bleed and may crop any of
the four sides; a side with less bleed has more crop. A page is never
stretched. A fluid page is laid out at the width of its cell's bleed box and
inset to the trim by the print document.

A cell's bleed never reaches its neighbor: it stops halfway across the gap,
so cells that touch have no bleed on the edges they share. A placement names
the edges where its bleed was cut short, so a host can warn that a drifting
cut may show the neighbor there. An outer cell's bleed is limited by the
distance from the cell to the paper's edge. A fixed page shown with `contain`
gets no bleed, so a fixed design that must bleed uses `cover`. A page with no
fixed height is clipped at its cell's bleed box if it is taller.

A host shows one paper of an imposition with `<segnavia-paper>`, a headless
element that scales the paper and all of its cells to the box the host gives it.

A label template is an imposition: label stock is a grid. The host supplies
the grid of the stock it sells or uses, and the library ships no catalogue of
stock numbers. Filling labels from records is the host's use of bindings,
one page per record.

**Sides.** An imposition's `sides` is `one` by default or `two`, and its `flip`
is `long` by default or `short`. With two sides, pages are a front followed by
its back, and an odd last page has a blank back. `impose` mirrors a back across
the named flip: on portrait paper a long flip mirrors x and a short flip y,
while landscape paper swaps those axes. A composed PDF and the browser print
document emit front then back for each physical paper, including a blank back,
so duplex pairing never shifts. `<segnavia-paper>` selects the shown face with
its `side` property and attribute. `maxSheets` counts those PDF pages, so a
two-sided imposition uses two per physical paper.

**Folds.** A folded piece is an imposition whose cells are panels: one row,
columns that may differ in width, two sides, and a fold line between columns.
This part is provisional. Its shape is settled once the first three are in
use, and it is done when a letter-fold brochure prints with every panel in
its place on both sides. A stapled booklet, whose pages are reordered across
several papers, is not covered.

`printableDeck` and `printablePages`, in `frame`'s server-safe print entry, are
the frame-based documents a browser shows and prints. Chromium paints no
background inside a sandboxed frame when it prints to PDF, and the sandbox is
never removed, so a browser's own print dialog loses slide and page
backgrounds. The renderer does not print those documents: it renders each
slide or page on its own as a top-level document and places the result using
the same geometry functions as the frame-based layout. Backgrounds and bleed
therefore print, the composed output stays vector, and the two paths cannot
place content differently. A page that runs its own code is waited for exactly
as it is by `pagePdf`, including its `window.pageReady` signal. Without an
imposition, `pagesPdf` joins each page's own PDF, which is how a postcard's
front and back share one file. The host's `maxSheets` limit counts PDF pages,
including both sides of an imposed physical paper.

A slide is a fixed page at the deck's size, so a deck prints through an
imposition too. `printableDeck` builds the frame-based papers for browser
printing, and `deckPdf` renders every slide at top level before composing the
same placements, preserving backgrounds. A grid of two columns and three rows
is a handout of six slides to a paper. The notes layout and an imposition do not
combine, and `beforeOutput` is not called for an imposed deck because there is
no single frame-based document on which to run it.

**Color for a press.** A browser draws in RGB, so a PDF render is RGB unless
the host passes `press.profile`: the ICC profile of the press, as bytes. The
library ships none. `pagePdf`, `pagesPdf` and `deckPdf`, including imposed
forms, rewrite the finished PDF once; `pageImage` and `slideImage` ignore the
option. Solid fills and strokes, including text and shadow colors and colors
inside Type 3 glyphs, and every axial or radial gradient stop are converted
through the profile. A black or neutral gray becomes black ink alone, so text
prints sharp. Non-mask transparency groups use DeviceCMYK, while a DeviceGray
group stays gray and a mask source keeps its declared space. Raster images,
including images drawn by Type 3 glyphs such as color emoji, stay byte-for-byte
as the author supplied them and are the only RGB the result may retain.
`press.report` receives their pixel dimensions and color-space kinds, plus
counts of converted fills, strokes, gradient stops and groups read back from
the finished PDF. An unfamiliar color operator, function, group or stream
filter is refused by name rather than left in RGB. Function-based shadings are
refused for now; axial and radial shadings are converted. The catalog's output intent
embeds the same profile with `/GTS_PDFX`, so a press interprets the CMYK numbers
through the profile that made them. The input byte ceiling is checked before
the rewrite, and the existing sheet and byte limit enforcement runs afterward,
so limits also measure the bytes and pages actually returned. Profile reads are bounded by
`MAX_PROFILE_BYTES` (32 MiB) and `MAX_PROFILE_TAGS` (256). Every inflated
content stream is bounded by `MAX_CONTENT_BYTES` (32 MiB) before tokenization.
One rewrite or read-back pass is bounded by `MAX_DOCUMENT_CONTENT_BYTES` (128
MiB) across all decoded content streams, and rewritten streams are compressed
again before the PDF is saved. `MAX_OPERANDS` (32) bounds the operands retained
while the tokenizer waits for an operator.

A proof image, a gamut report and a `convert` hook for a host-owned full
converter remain designed, not built.

The built rewrite is done when its read-back report finds no RGB outside the
authored images and reports that the page's text, solid fill and gradient were
converted.

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

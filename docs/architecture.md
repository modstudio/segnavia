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
| `DeckController` | All behavior: slides, play, seek, per-slide clocks, cues, viewer settings, keys in reading direction, exact and clamped `#slide-N` links, neighbor content, reload identity, and in-window presentation. Events: `change`, `slide`, `cue`, `error`, `end`, `exit`. Its clock and scheduler can be swapped, so the gate tests it; the `clock` option now receives `(slide, audio)` instead of `(narration, audio)`. | None: it renders nothing. |
| `<segnavia-stage>`, `<segnavia-page>`, `<segnavia-paper>` | Light DOM elements that show one slide, one page, or one paper of imposed pages in sandboxed frames. A stage scales to its box or the available window and can keep its neighboring slides mounted. | Only geometry, in `BASE_CSS`, every rule inside `:where()` with zero specificity. Colors are custom properties with plain defaults. |
| Styled components (`@segnavia/frame/controls`) | `<segnavia-play>`, `<segnavia-step>`, `<segnavia-track>`, `<segnavia-counter>`, `<segnavia-time>`, `<segnavia-mute>`, `<segnavia-captions>`, `<segnavia-caption>`, `<segnavia-notes>`, `<segnavia-fullscreen>`: each a finished piece connected by `for`, `controller` or the nearest ancestor. The track is segmented in step playback and becomes one seek slider in continuous playback. | Their own, each in a shadow root. Every color reads a `--segnavia-*` property first and falls back to `light-dark()`, so a host's accent and `color-scheme` reach them. |
| `<segnavia-player>` (`@segnavia/frame/player`) | The finished player: a two-row control bar around a stage, with time, notes, captions, sound, presentation, translatable labels and host chrome slots. `playback` and `captions` override the deck; `presentation` is `window` by default, or `native` or `off`. | Its layout, plus the components' look; `theme` sets its `color-scheme`. |

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
| `--segnavia-*` custom properties | stage, page, paper and player | Colors, radius, type, annotation color, cue fade, transition duration and transition fit scale. |
| `neighbors` | `<segnavia-stage>` | Whether previous and next frames remain mounted, inert and visually hidden when author scripts are refused. A deck with sandboxed scripts mounts no neighbors because a running author script in a hidden frame could take the page's keyboard focus; on a turn, its `data-incoming` frame loads invisibly above the `data-active` frame and replaces it after two parent animation frames. A bounded timeout completes a stalled swap, and a later turn cancels one still pending. Reloading an open deck rebuilds a mounted frame when its resolved content, scripts mode, host CSS or extra CSP changes, while keeping the selected id and leaving the address unchanged. The visible frame and its annotations keep the deck's direction. |
| `transition`, `transition-duration` | `<segnavia-stage>`, `<segnavia-player>` | A host override for deck turns. Kind is `none`, `fade` or `slide`; duration is an integer from 0 to 2000 milliseconds. The object property takes precedence over the two independently read attributes. Invalid attribute values are ignored. Reduced-motion readers always receive an instant turn. |
| `keys` | `DeckController` option | `'stage'` for stage-local keys or `'page'` for bounded page-wide arrows and page keys. In page mode, form fields retain arrows and page keys, while Escape still ends an in-window presentation. Arrows follow reading direction. |
| `playback`, `captions`, `seek`, `setMuted`, `setCaptionsVisible` | `DeckController` | A host may override the deck's step or continuous playback mode and caption policy, position the pure deck timeline, and expose viewer sound and caption choices. Viewer choices share one guarded local-storage record and can be disabled with `persist: false`. |
| `actions`, `below` slots | `<segnavia-player>` | Host chrome beside the built-in actions or below the control bar. Below-bar content remains inside the player and is hidden during presentation. |
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
| `Lexicon`, `lexiconProvider`, `publishElevenLabsLexicon`, `pronunciationDictionaries` | `format`, `voice` | The host's pronunciation list. It is published as an ElevenLabs dictionary and passed to its provider; any other provider respells the script through `lexiconProvider`. |
| `prefix`, `linkOrigins` | `html` | The bindings attribute prefix, and the https origins a link may point at. |

## Player surface

The player keeps `src`, `theme`, `notes`, `hash`, `prefetch`, transition attributes, `controller`, `resolveSlide`, `css`, `cspExtra`, `labels` and the `transition` property. Its control track occupies the first bar row. The second row keeps previous, play and next centred between time at the start and actions, mute, captions, notes and presentation at the end. At narrow container widths it removes secondary chrome without moving play.

The `actions` slot accepts any host element before the built-in end controls. Slotted buttons receive the player's icon-button size, shape, colour, hover and focus treatment by default through the `--segnavia-*` tokens; host styles can override that default. The `below` slot keeps arbitrary host chrome beneath the bar and hides it while presenting.

The styled controls use copied Lucide icons under the ISC licence; attribution and the applicable licence texts ship in `@segnavia/frame`'s `THIRD-PARTY-NOTICES`.
Headless hosts can import the typed SVG strings individually from `@segnavia/frame/icons`; the headless entry does not include them.

Every inner styling hook crosses the player shadow boundary. The stable exported parts are `play-button`, `step-button`, `previous-button`, `next-button`, `track`, `segment`, `counter`, `time`, `mute-button`, `captions-button`, `presentation-button`, `notes-button`, `caption`, `word`, `word-spoken` and `word-current`; the existing player-level `player`, `stage`, `notes`, `caption` and `bar` parts remain. Control sizing reads `--segnavia-control-size` and `--segnavia-play-size` in addition to the existing tokens.

## How a deck plays

1. The deck is parsed with `Deck.parse`, which refuses a cue naming a word or
   annotation that does not exist and a slide id used twice.
2. For each slide shown, the controller runs `resolveSlide` if it is set. `contentFor(index)` does the same without navigating and shares the prefetch cache. A `shot-ref` is
   fetched as a `PublishedShot`, cached per address, and resolved relative to
   that address.
3. HTML goes into a frame through `frameDocument`. The CSP and the bridge
   come first, before anything the author wrote. Under `scripts: 'refuse'`
   the policy admits only the bridge's nonce.
4. `slideDurationMs` adds `beforeMs`, narration duration and `afterMs`, or
   reads `holdMs` for an unnarrated slide. Without either narration or a hold
   the slide is untimed. `deckTimeline` gives every slide its start and
   duration, marks untimed entries and totals timed durations, and
   `positionAt` maps a deck-wide time back to a slide and an offset within it.
   Pure `slideStateAt`, built on `phaseBounds`, gives export and playback the
   same word, cues and phase, including a distinct `untimed` phase for slides
   without a duration. A slide without narration shows all its annotations.
5. A timed slide gets a positionable clock. `timedClock` uses wall time for
   before, after and hold phases, audio time during recorded narration, and
   narration timing if playback is refused. `speechClock` uses browser speech
   for live narration; seeking it returns to the slide start, and muting
   cancels speech while paced timing finishes the slide. Pause preserves the
   position. On each frame the controller publishes slide and deck elapsed
   time, total time, progress, word and annotations.
6. With `neighbors` and `scripts: 'refuse'`, the stage keys frames by slide id and keeps the selected slide plus its previous and next slide. Hidden neighbors are inert. A turn reveals the already-running neighbor without changing its document; if that neighbor is still loading, the turn waits for it or the bounded swap timeout. A deck with `scripts: 'sandboxed'` mounts no neighbors because a running author script in a hidden frame could take the page's keyboard focus. On a turn it loads the incoming frame invisibly above the outgoing frame, then swaps after the load event and two parent animation frames; a bounded timeout completes a stalled load. The deck's `transition` (`{ kind: 'none' | 'fade' | 'slide', duration }`) chooses the turn's motion, an absent setting meaning an instant turn, and a host's `transition` property or attributes override it. A fade or slide transition runs while both frames are present, after a refused-script neighbor is revealed or after the incoming frame is ready on the swap path, and the outgoing frame remains until motion ends. Slide direction follows the deck's inline direction. Reduced motion, `none`, and a zero duration settle instantly. A later turn finishes running motion and starts from the frame then visible, while a turn during loading cancels a frame created for the pending turn and leaves a reused neighbor mounted. Reloading a reordered deck keeps the selected id and its frame; removing it keeps the old position, clamped into the new bounds. Reloading replaces a mounted frame when its resolved content, scripts mode, host CSS or extra CSP changes, while keeping the selected id and leaving the address unchanged.
7. A first load reads an exact `#slide-N`, clamped to the deck's bounds. `go`, keys and live hash changes navigate directly and replace the address rather than adding history.
8. In page-key mode, arrows and page keys work outside form fields, Space has no deck action, and Escape ends an in-window presentation. `m` toggles mute, `c` toggles viewer-controlled captions, and `f` returns `present` for the host to handle. These three letters are ignored when typed into an input, textarea, select or editable element, in the page listener, the player and keys relayed from a slide frame. `present(element)` marks the chosen element with `data-presenting`, locks body overflow and uses `--segnavia-backdrop`; `stopPresenting`, stage disconnection and controller destruction restore it. `<segnavia-fullscreen mode="window">` uses this path, while its default remains native fullscreen.
9. `fit="viewport"` scales from the stage's unscaled inline space and `window.innerHeight`, subtracting its block-start edge and `reserve` at both block edges. While presenting it uses the presented element's block size. It reports `{ scale, width, height }` through `fitted` and `segnavia-fit`; window, visual-viewport and stage resizes trigger a new measurement.
10. When a timed slide ends, play advances in either playback mode. An untimed
    slide stops and waits; Play there advances to the next slide.

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

## Long documents

A `Book` is either continuous, where the screen is one scrolling flow, or paginated, where a page size and mirrored top, bottom, inner and outer margins are required. It contains optional front-matter sections and one or more chapters; either may carry HTML, and chapters may replace their title in running heads. Front-matter sections can opt out of the table of contents, and contents page numbers can be omitted.

Page numbering is set separately for front matter and the body, while footnote and endnote markers have their own settings. Hebrew (`he` or `iw`) defaults to Arabic front-matter numbers, Hebrew body numbers and Hebrew footnote markers. Other languages default to lower-case Roman front-matter numbers, Arabic body numbers and symbol footnote markers. Endnote markers default to Arabic in every language. Footnotes restart by chapter unless set to run through the book; endnotes belong at the end of the book unless a paginated book places them at the end of each chapter.

A paginated book without a page is refused. Front matter and the body cannot use the same numbering system, chapter endnotes require paginated mode, and page margins must leave a text area. The remaining refusal depends on content: once the HTML reader knows that both footnotes and endnotes are used, it applies `noteMarkerIssues` to require different markers; `Book.parse` cannot apply that rule without scanning HTML. Laying out the content, numbering its pages and placing its notes belong to the continuous-mode and paginated-mode work that this value feeds.

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

**Sideways overflow.** On screen, content that overflows a page sideways is
clipped at the page edge. Chromium's print path instead shrinks the whole page
to fit it. A render at a fixed size (a page with a fixed width and height and
no print paper, each deck slide, each imposed piece) therefore prints with
paint containment on its root, so the overflow is clipped as on screen and the
page keeps its own scale. A growing or fluid page, a page printed on paper, and
the deck's printable document print without it, because containment applied
before a growing page is measured drops absolutely positioned content from its
height, and on a print of several pages it stops a fixed element repeating on
every page. Those prints still shrink when their content overflows sideways.

**Effects in PDF readers.** Chromium writes CSS shadows and blurs as
luminosity soft masks. Rule 1 rewrites a mask whose transparency group paints
one grayscale image over the default black backdrop: the masked constant-color
rectangle becomes an image whose direct alpha soft mask is that grayscale
image. Rule C handles a nested-mask composite when every varying color and
coverage layer is a shading along one shared affine axis. It samples color and
combined coverage every 0.5 pt along that axis into an interpolated,
one-sample-wide RGB image and DeviceGray image soft mask, then replaces only
the composite's paint. Shading types, functions, coordinates and matrices,
the mask chain and constant opacity must all be established from the PDF;
otherwise the composite stays as Chromium wrote it.

Both rules hold every graphics state a rewrite depends on to one allow-list,
including the states set inside a mask group or a nested form. A `gs` adds
its keys to the state already in effect, so each state is read merged with
the earlier ones under the same `q`. A form must have no `/Matrix` or the
identity. A graphics state may set only `/Type`, `/SMask`, a finite `/ca`,
`/CA` 1 and `/BM /Normal`. Rule C bakes an outer or alpha-mask `/ca` into its
coverage. A `/ca` other than 1 on the image Rule 1 copies, or on a Rule C
color or luminosity layer, keeps the mask as written.

`effects: false` preserves Chromium's masks; an absent `effects` option enables
the rewrite, and `effects.report` receives separate Rule 1 and Rule C counts
and a count of masks kept as written. The effects rewrite
runs before the press rewrite, which converts generated Rule 1 images and Rule
C's RGB samples to CMYK without reporting them as authored RGB images.

Rule 2, for vector mask groups, is unbuilt because the corrected reader
measurements do not show a defect that needs it. Rule 3 is left out because
measurements showed that combining nested masks did not fix the reader defect.
Rule 4 is the unbuilt fallback for a nested composite whose layers do not share
one axis: rasterize only the effect region from Chromium while retaining later
content as vector. When built it is an opt-in export option that is off by
default; the suite currently has no document that needs it.

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
counts of converted fills, strokes, gradient stops, sampled shadings and groups read back from
the finished PDF. An unfamiliar color operator, function, group or stream
filter is refused by name rather than left in RGB. Function-based shadings are
converted by sampling their calculator program onto a DeviceCMYK type 0 function,
8 bits per sample, capped at `MAX_SHADING_SAMPLES` (1 048 576). Painted bounds are
gathered for the whole document in a pass before any conversion, under its own
`MAX_DOCUMENT_CONTENT_BYTES` budget. That pass replays each page's Contents in
order every time a stream appears, and walks resources reached from content
(forms, Type 3 glyphs, tiling patterns, soft masks) with a fresh tracker. The
tracker unions fill and stroke path boxes after the content CTM (strokes grown by
the current line width, join and miter). For each use of a shading, that
rectangle maps through the inverse of (pattern `/Matrix` times shading
`/Matrix`) and intersects the shading Domain; the union over every use becomes
the Type 0 function's Domain, and the shading's own Domain stays. The sample grid
is the largest per-use grid over that Domain, one sample per 0.5 pt through each
use's combined matrix. A use the pass cannot bound samples the full Domain under
that ceiling, so a sampled Domain is never smaller than a painted use needs. Sample counts across one rewrite are capped at
`MAX_DOCUMENT_SHADING_SAMPLES` (4 194 304), the fidelity suite's four Type 1
shadings at the per-shading cap, charged before a shading is evaluated. Calculator
work across one rewrite is capped at `MAX_DOCUMENT_CALCULATOR_OPERATIONS`
(436 207 616), eight max-size Chromium conic programs, charged before evaluation
as samples times the program's operator count. The
interpreter bounds each evaluation at `MAX_CALCULATOR_PROGRAM_BYTES`
(8192), `MAX_CALCULATOR_OPERATORS` (4096) and `MAX_CALCULATOR_STACK` (32). Sampled
data counts against `MAX_DOCUMENT_CONTENT_BYTES` and is charged before evaluation. Axial and radial shadings are
converted by their stops. The catalog's output intent
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

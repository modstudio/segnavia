# Architecture

## Packages

```
format  ◄── html          (universal: browser and server)
  ▲
  ├── frame               (browser; svg, timeline, bridge, fit and print-document are server-safe)
  │     ▲
  │     └── react         (browser adapter; React is a peer dependency here only)
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
| `<segnavia-stage>`, `<segnavia-page>`, `<segnavia-paper>`, `<segnavia-book>` | Light DOM elements that show one slide, one page, one paper of imposed pages, or one continuous book in sandboxed frames. A stage scales to its box or the available window and can keep its neighboring slides mounted. Image and shot content chooses `contain`, `cover`, `width` or annotation-aware `focus` fit, with a slide setting overriding the deck default. A book fills the box its host gives it and scrolls within its frame without growing to its content. | Only geometry, in `BASE_CSS`, every rule inside `:where()` with zero specificity. Colors are custom properties with plain defaults. |
| Styled components (`@segnavia/frame/controls`) | `<segnavia-play>`, `<segnavia-step>`, `<segnavia-track>`, `<segnavia-counter>`, `<segnavia-time>`, `<segnavia-mute>`, `<segnavia-captions>`, `<segnavia-caption>`, `<segnavia-notes>`, `<segnavia-fullscreen>`: each a finished piece connected by `for`, `controller` or the nearest ancestor. The track is segmented in step playback and becomes one seek slider in continuous playback. | Their own, each in a shadow root. Every color reads a `--segnavia-*` property first and falls back to `light-dark()`, so a host's accent and `color-scheme` reach them. |
| `<segnavia-player>` (`@segnavia/frame/player`) | The finished player: a two-row control bar around a stage, with time, notes, captions, sound, presentation, translatable labels and host chrome slots. `playback` and `captions` override the deck; `presentation` is `window` by default, or `native` or `off`. Its default `fit="contain"` keeps the whole player in the visible viewport when possible; `fit="width"` sizes from its inline space alone and `fit="height"` fits the stage inside a host-provided definite height. `controls="below"` keeps caption and controls after the slide; `controls="overlay"` places them over it. Presentation always keeps its existing height-fitted layout. | Its layout, plus the components' look; `theme` sets its `color-scheme`. |

`unstyled` on the stage, page or paper drops even the geometry, for a host that lays them out itself.

`architecture.ts` declares each package's runtime and imports, and
`bun run check` enforces it. `format` and `html` run anywhere. `frame` defines
the custom elements, but its server-safe entry points are the single source
of the frame document, the annotation drawing, fit and image-fit geometry, the
timeline and the print document. The browser uses that frame-based print layout; the
server uses its geometry while composing top-level renders.

`Board` is the portable value for an unbounded collection of referenced
assets, labels and sections. It stores each item's width but not its height;
the host supplies intrinsic item shapes and measured label sizes when it calls
the pure placement geometry. Bounds, board-to-screen transforms, visibility,
hit-testing and grid or row arrangement live in universal
`@segnavia/format`, so browser and server callers use the same calculations
without loading an element.
A board's unbounded surface is its canvas, while a slide's canvas is bounded.

The seven packages are built as ESM JavaScript and declarations with tsdown;
their tsdown platform comes from each package's runtime in `architecture.ts`.
Installed hosts resolve package exports to `dist`. Repository commands pass
the `@segnavia/source` export condition, also configured for TypeScript, so
Bun and Node resolve workspace imports directly to `src` while developing.

## The seams

The library declares every seam, and hosts implement them. Nothing in the
library names a host.

For a continuous book, the host calls `bookDocument` from `@segnavia/html`
and passes its HTML and the book's title, direction, language and script policy
as a `BookView` to `<segnavia-book>`. The frame library validates that view,
resolves its direction and shows it in one internally scrolling sandboxed
frame; it does not import the HTML library or construct the book document.
Contents and note links are ordinary in-page anchors handled inside the frame,
and the bridge carries only its existing key, height and ready messages.
The element emits `ready` when that bridge message arrives and emits `error`
with `detail.message` when loading or validating an input fails.

| Seam | Where | What the host supplies |
|---|---|---|
| `Host` and `HostSession` | `capture/src/host.ts` | Session setup (`context`, `contextFor(flow)`), CSS to hide account details, per-flow `extras` (an API client, seeded data, a CLI bridge), `beforeNavigate` (wait for capacity), `observe` (watch responses), `refuseShot` (veto a broken screen), `close`. |
| `resolveSlide` | `DeckController` option and property; `<segnavia-player>` property | Content minted when a slide is shown: a single-use ticket URL, a signed image, a fresh shot. |
| `contentFor` | `DeckController` | Resolved content for a neighbor without navigating; the stage shares the controller's prefetch cache. |
| `css`, `cspExtra` | `<segnavia-stage>`, `<segnavia-page>`, `<segnavia-paper>`, `<segnavia-player>`, render options | House style, and extra CSP directives. |
| `labels`, `frameTitle` | `<segnavia-player>`, `<segnavia-stage>` | The skin's words and the localized frame title. `defaultFrameTitle` supplies the English default, and the position is recomputed after a reorder. |
| `--segnavia-*` custom properties | stage, page, paper and player | Colors, radius, type, annotation color, cue fade, transition duration and transition fit scale. `--segnavia-shot-backdrop` supplies the plain canvas behind contained images and shots. `--segnavia-fit-reserve` lets a player host reserve viewport height for the host page's own chrome; the player measures its caption, bar, `.below` slot and stacked rail itself. `--segnavia-overlay-scrim` supplies the overlay caption and control scrim. |
| `neighbors` | `<segnavia-stage>` | Whether previous and next frames remain mounted, inert and visually hidden when author scripts are refused. A deck with sandboxed scripts mounts no neighbors because a running author script in a hidden frame could take the page's keyboard focus; on a turn, its `data-incoming` frame loads invisibly above the `data-active` frame and replaces it after two parent animation frames. A bounded timeout completes a stalled swap, and a later turn cancels one still pending. Reloading an open deck rebuilds a mounted frame when its resolved content, scripts mode, host CSS or extra CSP changes, while keeping the selected id and leaving the address unchanged. The visible frame and its annotations keep the deck's direction. |
| `transition`, `transition-duration` | `<segnavia-stage>`, `<segnavia-player>` | A host override for deck turns. Kind is `none`, `fade` or `slide`; duration is an integer from 0 to 2000 milliseconds. The object property takes precedence over the two independently read attributes. Invalid attribute values are ignored. Reduced-motion readers always receive an instant turn. |
| `keys` | `DeckController` option | `'stage'` for stage-local keys or `'page'` for bounded page-wide arrows and page keys. In page mode, form fields retain arrows and page keys, while Escape still ends an in-window presentation. Arrows follow reading direction. |
| `playback`, `captions`, `seek`, `setMuted`, `setCaptionsVisible` | `DeckController` | A host may override the deck's step or continuous playback mode and caption policy, position the pure deck timeline, and expose viewer sound and caption choices. Viewer choices share one guarded local-storage record and can be disabled with `persist: false`. |
| `actions`, `below` slots | `<segnavia-player>` | Host chrome beside the built-in actions or below the control bar. Below-bar content remains inside the player and is hidden during presentation. |
| `connectWindow`, `disconnectWindow` | `DeckController` | Resume or suspend the controller's hash and page-key listeners. A disconnected player stops presentation, pauses playback and suspends its controller's listeners; reconnecting resumes the listeners but not playback. A disconnected stage does the same for a host-owned controller, while a stage-created controller is destroyed. Moving either element in the DOM therefore preserves its usable controller in a paused state. |
| `present`, `stopPresenting`, `presenting`, `data-presenting` | `DeckController` and `DeckState` | The element to present over the window, the exit operation, readable state and the host styling hook. `--segnavia-backdrop` supplies its backdrop. |
| `fit="viewport"`, `reserve`, `fitted`, `segnavia-fit` | `<segnavia-stage>` | Window fitting, fixed block-start and block-end room in CSS pixels, and the resulting scale and size. Inline padding and block edges follow CSS writing direction. |
| `inline` | print options | A way to turn a slide's image path into a data URL for offline rendering. |
| `title`, `labels.noSpeakerNotes` | print options | An escaped document `<title>` (the deck title by default; omitted when empty), and the placeholder printed on a notes sheet that has none when some other slide has notes. |
| `fonts` | render options | Faces to embed, as bytes. |
| `limits` | render options, `exceedsLimits` | The host's ceilings: PDF pages, bytes, slides, slide size, notes size. |
| `Imposition` | print and render options | The paper, grid, sides and flip of the host's label stock or card; marks and folds are not built. |
| press profile | render options | A CMYK or greyscale ICC profile, as bytes, and a report callback for the destination, residual authored RGB images and conversion counts read back from the output. |
| `convert`, proof image, gamut report (designed, not built) | render options | A future hook may supply a full converter for the finished PDF, with a proof and out-of-gamut colors for a host to show. |
| `VoiceProvider`, `alignedProvider` | `voice` | A speech engine and, where it gives no timings, an aligner. |
| `Lexicon`, `lexiconProvider`, `publishElevenLabsLexicon`, `pronunciationDictionaries` | `format`, `voice` | The host's pronunciation list. It is published as an ElevenLabs dictionary and passed to its provider; any other provider respells the script through `lexiconProvider`. |
| `prefix`, `linkOrigins` | `html` | The bindings attribute prefix, and the https origins a link may point at. |
| `deckFromSlides` | `format` | A host can turn generic HTML and shot rows into a parsed `Deck`, carrying deck options and optional timing, narration and notes. `omitNotes` produces a public projection without notes; `Deck.parse` remains the validation edge. |
| `rail`, `<segnavia-rail>` | player and `frame/controls` | A host can compose the styled listbox alone or enable it on the player. It lazily mounts script-refusing 16:9 previews near the viewport, clears a preview that leaves the observed margin, invalidates a pending mount for that thumbnail, never clears the current slide, follows current-slide identity, and navigates through the controller. The player places it at inline start; at compact below-controls it sits below the transport row and above host actions, and it hides during presentation. In the desk layout the rail's grid track takes its size from the body row, so the list is a scroll box and only nearby thumbnails stay mounted, whatever the deck length. `--segnavia-rail-size` sets thumbnail width. |
| `<segnavia-thumbnail>` | `frame` and React | The headless seam for a host's deck covers in cards, strips and search results. It draws one HTML, image, URL or shot slide through a private `DeckController`, sharing the rail's script-refusing canvas policy. It follows its own inline size at the deck aspect ratio, mounts only near the viewport, and removes the canvas when far away. `deck`, `index`, `resolveSlide` and `base` select and resolve content; `thumbnail` and `canvas` parts let a host add rings, rounding or shadows. Resolution failures leave it empty and emit `segnavia-thumbnail-error`. It takes the host stylesheet through `css`, as the stage does, so a cover matches the slide in the player. |
| `<segnavia-board>` | `frame` | The headless viewer for a `Board`. It places items, labels and sections in screen pixels, pans and zooms without scaling live text, mounts only nearby items, and switches from covers to script-refusing live elements at `liveWidth`. A live deck is its first slide through `<segnavia-thumbnail>`, whose frames run no script at all; a live page, paper or book mounts its element with scripts refused. Every item carries a shield, so pointer and wheel input reaches the board and never a frame. Board coordinates are physical: x is measured from the left, while `direction` governs arrange and the board's own text rather than placement. The host's async `resolveItem(item)` property supplies content, while `itemNames(items)` supplies names, one batch for the items not yet named. Both are cached by address; resolved results last for the element's lifetime, and setting a different `itemNames` drops every cached name and ignores any answer still pending from the old function. `itemName(id)` reads a host name and then the resolved title. `kindIcon(kind)` creates a fresh kind icon for every board title and list row, and changing it emits `segnavia-board-icons`. `itemActions` adds kind-filtered title buttons, localized by `labels`, whose activation emits `segnavia-board-item-action`. An item's name sits above its start corner in the board's direction, keeps its own direction inside and truncates before its actions. `selection` holds valid item ids once each in board order, while `selected` is its single-item view; click, shift-click, Space, Escape and Cmd/Ctrl+A update it, and each change emits `segnavia-board-selection` with `{ items, item }`, where `item` is the first selected item or null. A resolved result is checked before it is cached: its kind must match the item's, and its size must be finite and positive. A rejection, a refused result or a live view that fails to mount leaves the item a placeholder that is not retried while its result stays cached, and emits one `segnavia-board-error`. Page, paper and book results carry the explicit natural `size` the board reserves; for fluid and auto-height pages the host chooses that size. Setting a new board keeps each mounted item whose id, address and kind are unchanged, so its live view does not reload, then emits `segnavia-board-change`; `segnavia-board-names` fires when host names arrive or a resolved item supplies a title. `view`, `fitAll()`, `zoomIn()`, `zoomOut()`, `zoomTo(zoom)`, `reveal(id)` and `segnavia-board-view` expose view state. `reveal` fits an item or section into view, clamped to the board's zoom range, and refits an item once its resolved shape changes its height, unless the view has moved since. `segnavia-board-open` hands opening back to the host. |
| `<segnavia-board-list>` | `frame` | A headless searchable list connected to a board by `target` or `for`. It groups items under their first section, leaves unsectioned items last, and shows a fresh `kindIcon` before each item name but not a section. It searches host names immediately and asks the optional `searchItems(query, signal)` host seam for content matches after a debounce. It follows board direction; each name aligns to the list's start and keeps its own direction inside, so a Hebrew name in a left-to-right list lines up with its neighbors and truncates from its end. A board change or a new `searchItems` clears content matches and searches again. It reveals and selects an item before emitting `segnavia-board-select`; a section reveal does not change selection. It emits `segnavia-board-search-error` when a non-aborted host search fails. Labels localize its search, empty and untitled text. |
| `<segnavia-board-toolbar>` | `frame` | Headless list, zoom, reset and fit controls connected to a board by `target` or `for`. `list` or `list-for` optionally binds a board list and exposes its first toggle button; `segnavia-board-list-toggle` is cancelable before the list's `hidden` state changes. It follows the board direction, reports Share through `segnavia-board-share` when `shareable`, and leaves sharing and placement to the host. Labels are translatable. The `icon-list`, `icon-zoom-out`, `icon-zoom-in`, `icon-fit` and `icon-share` slots have no default icons. |
| `attachAuthoring(player, handlers, options?)` | `frame/authoring` | An opt-in browser entry attaches only the editors represented by async host handlers. `AuthoringOptions.notesMaxLength` sets the notes field limit and defaults to 20,000. The library owns optimistic order, rollback, autosave, pending and dirty state; the host owns every write and the entry makes no network call. `flush()` saves pending notes without starting a save on a clean deck and returns a deck whose notes are what the author sees, including a draft whose save failed. `draftDeck()` returns that same authored deck synchronously, without waiting for persistence, so export and print can use `printDeck(authoring.draftDeck(), …)` even while a host save is paused. `adoptNotes(notes)` seeds host notes through the save queue and updates the visible field when that slide's text changed, without `load`, navigation-guard, prefetch or shot clearing. It captures the notes queue before awaiting the save, so a `detach()` during that save still returns those drafts, and after `detach()` it uses the last queue the same way. `useAuthoring` returns that same controller, including `draftDeck` and `adoptNotes`. `detach()` tears down authoring synchronously, starts flushing the captured notes queue, and its promise settles after those saves. A host that must guarantee the save before navigating awaits `detach()` itself; React cleanup starts it without awaiting because React cleanup cannot be async. This seam can gain separate handlers for future slide and timing operations without putting authoring in viewer bundles. |
| `attachBoardEditing(board, options)` | `frame/board-editing` | An opt-in browser entry adds move, resize, remove, add and arrange editors without putting them in viewer bundles. During editing, every section fits its members with padding and title room; a member released inside its section's rectangle from the start of the gesture stays there, while other moved items join the topmost section under the release point or become unsectioned. Keyboard nudges and section-chip moves preserve membership. A settled edit compares the previous and next boards so sections that lost touched members refit, then nudges overlapping non-members and measured labels clear, cascading through neighbors while a moved section carries its members. Live item dragging fits sections and marks its drop target immediately but makes room only on release; a viewer without editing renders stored rectangles unchanged. The host supplies one whole-board async `change` handler because a board is one document and a single ordered write makes persistence and undo uniform. Edits render optimistically through a serial queue; rejection restores the value before the failed edit, discards later queued work and emits `segnavia-board-edit-error`. On the screen and in history, a host board assignment replaces pending local work and is the only operation that aborts pending changes' signals; a write the host already started is the host's to cancel. `detach()` removes editing input and overlays while pending and queued changes continue to settle. The entry owns bounded undo and redo history and reports its availability through `segnavia-board-history`; the host owns every write and the entry makes no network call. |
| React components and hooks | `@segnavia/react` | A separate adapter maps React properties, attributes, events and forwarded refs onto frame custom elements. A host captures the mounted element with a callback ref, then passes that element to `useDeckController(element)` to observe controller changes or `useAuthoring(player, handlers, options?)` to own the optional authoring attachment. Both hooks follow element identity across conditional mounts and replacements. React and React DOM are peers of this package only. |

The authoring reorder handler receives slide identity and old and new indexes. One move may be pending; while it is, `dirty` is true and `dirty-change` fires, and when it settles either way `dirty` is recomputed. Resolution keeps the optimistic order and rejection restores it and emits `authoring-error`. The notes handler receives slide identity and text. Notes save after 600ms, keep at most one save in flight per slide, coalesce later edits into a follow-up save, flush before a slide change, on detach, and through `flush()` when the host must wait for persistence, remain editable after a rejection, and expose dirty changes. An entry stays dirty while an in-flight write differs from the current text, and `flush`, `flushAll` and `retry` join that write before treating the entry as clean. A deck reload by the host adopts the host's notes and saved baseline for each settled slide, including the visible field, without making the editor dirty or emitting `dirty-change`; an entry with an unsaved edit or in-flight save preserves its local text until it settles and a later reload by the host adopts the host value. `adoptNotes` applies that same seed without loading a deck. A load that preserves a draft starts the notes flush without awaiting it, so an internal rail move is not blocked by a paused save; slide navigation still waits. Navigation and optimistic reorder do not adopt notes from their deck state. The library installs no `beforeunload` warning: the host owns any warning based on `dirty`. While the editor has focus, the stage and every thumbnail reload with scripts refused so a slide cannot retain keyboard focus, then restore their prior script policy on blur. Authoring labels extend `PlayerLabels` and partial label sets fall back to English.

`@segnavia/react` releases in the fixed package group like the other packages.

Board sections default to auto layout. Their optional `cells` place each member on explicit zero-based row and column tracks; auto tracks take their largest member, empty tracks collapse, and board direction chooses the physical start side for columns. A manual section preserves its members' free positions. Attaching board editing settles every section once and reports one `settle` edit when geometry changes. Auto-section edge and gap drops update cell placement, removal closes the member's row gap, resize relays on release, keyboard nudges are ignored, and a `drop-marker` previews placement without live reflow.

## Player surface

The player keeps `src`, `theme`, `notes`, `hash`, `prefetch`, transition attributes, `controller`, `resolveSlide`, `css`, `cspExtra`, `labels` and the `transition` property. `fit` is `width`, `height` or `contain`, with `contain` the default. Containment chooses the largest deck-ratio slide no wider than the player for which the whole player fits within the visible viewport block size: the slide, caption, bar (via `measuredBarHeight`, including the flattened compact track, transport and host-action rows), `.below` slot, and, at compact below-controls, the stacked rail. This chrome is measured in one place for both fixed and responsive layouts. The slide has a 240px block-size floor, centers when height is limiting, and may scroll in a shorter viewport. `--segnavia-fit-reserve`, whose default is `0px`, subtracts only height the host keeps for its own page chrome; it is not for the player's caption, bar, `.below` slot or rail. The size responds to connection, player and viewport resizing, orientation changes, fit and control placement changes, a new or resized deck, presentation changes, and notes or rail toggles; playback ticks and scrolling do not remeasure it. At compact widths the player keeps its content height.

`controls` is `below` by default or `overlay`. Overlay makes the player box equal the slide box and places the caption and bar over its bottom edge on `--segnavia-overlay-scrim`. The bar stays visible while paused or ended, during interaction and while a control has focus. During playback it hides after three seconds without pointer, touch or handled-key activity, and reveals before hidden controls can receive focus. The caption remains visible above the bar and moves to the slide's bottom edge when the bar hides. Reduced-motion readers receive no fade. The `actions` slot remains in the bar and the `below` slot remains outside the overlaid player box. With `rail`, the rail keeps its column at the inline start, or its row below the slide at narrow widths, and the overlay covers the slide alone. Presentation retains its existing layout, and existing narrow-layout rules still hide secondary controls.

The control track occupies the first bar row. The second row keeps previous, play and next centered between time at the start and actions, mute, captions, notes and presentation at the end.

Compact below-controls uses one recipe. The player's container query and its measure path share `COMPACT_PLAYER_WIDTH` (560). At that width and below, with `controls` below and not presenting, the bar flattens into the player grid: slide, caption, track, transport row, rail, host actions side by side, then `below`. The stage takes a light edge. The shadow tree is the same at every width: `.actions` stays inside `.end`, so keyboard order is Play, Next, host actions, end controls, then rail, even though compact paints the actions last. Moving `.actions` after `segnavia-rail` was tried and rejected, because Chromium's Tab then left the player at the rail and never reached the actions; reachability outranks matching the painted order. A slotted `<button>` with text stretches to its share of the row instead of keeping the icon-button square. Overlay compact does not flatten: the bar stays stacked on the slide, actions remain a second row of that bar, and the rail sits below the slide. Presentation keeps the bar as a box, hides the rail, and also keeps desk DOM. With no assigned `slot="actions"` nodes the player drops `data-actions` and the actions row is hidden, so containment reserves no height for it. Compact transport padding uses logical insets. Overlay caption clearance uses `--segnavia-bar-height`, an internal custom property the player sets on the caption from the measured bar; it is not host output. At compact widths the player still hides the counter and notes panel and, below 380px, presentation.

The `actions` slot accepts any host element before the built-in end controls. Slotted buttons receive the player's icon-button size, shape, color, hover and focus treatment by default through the `--segnavia-*` tokens; host styles can override that default. The `below` slot keeps arbitrary host chrome beneath the bar and hides it while presenting.

The styled controls use copied Lucide icons under the ISC license; attribution and the applicable license texts ship in `@segnavia/frame`'s `THIRD-PARTY-NOTICES`.
Headless hosts can import the typed SVG strings individually from `@segnavia/frame/icons`; the headless entry does not include them.
Every built-in icon can instead be supplied as slotted content. The player forwards `icon-play`, `icon-pause`, `icon-previous`, `icon-next`, `icon-mute`, `icon-unmute`, `icon-captions-on`, `icon-captions-off`, `icon-enter-presentation`, `icon-exit-presentation` and `icon-notes` to the matching control; the same slots work directly on standalone controls.

Every inner styling hook crosses the player shadow boundary. The stable exported parts are `play-button`, `step-button`, `previous-button`, `next-button`, `track`, `segment`, `counter`, `time`, `mute-button`, `captions-button`, `presentation-button`, `notes-button`, `caption`, `word`, `word-spoken` and `word-current`; the existing player-level `player`, `stage`, `notes`, `caption` and `bar` parts remain. Control sizing reads `--segnavia-control-size` and `--segnavia-play-size` in addition to the existing tokens.

## How a deck plays

1. The deck is parsed with `Deck.parse`, which refuses a cue naming a word or
   annotation that does not exist and a slide id used twice. Its `layout` is
   `fixed` by default or may opt into `responsive`. A fixed deck lays every
   screen canvas out at `deck.size` and scales it to the stage. A responsive
   deck instead lays its screen canvas and HTML frame out at the stage box's
   rounded CSS-pixel size, at scale 1; a missing definite height falls back to
   the deck aspect ratio. Image, shot, focus, frame and annotation geometry use
   that responsive canvas size too. Rail thumbnails, standalone thumbnails and print/PDF canvases
   remain fixed at `deck.size`, so a responsive deck's screen and PDF layouts
   may differ.
2. For each slide shown, the controller runs `resolveSlide` if it is set. `contentFor(index)` does the same without navigating and shares the prefetch cache. A `shot-ref` is
   fetched as a `PublishedShot`, cached per address, and resolved relative to
   that address. Its fit and frame settings are copied to the resolved shot and
   override the deck's settings, as do an inline image or shot's own settings;
   otherwise image and shot content uses the deck's `contain` fit and unframed
   default. `fitImage` is the server-safe pure
   geometry shared by the stage, rail and print document. `contain` centers the
   whole image, `cover` centers a crop that fills the canvas, and `width` fills
   its width from the top unless a short image needs vertical centering. `focus`
   starts from `cover`, zooms out only enough to show the padded union of every
   annotation ring, badge, arrow and arrow label, and moves that focus into view
   while the image covers the canvas wherever its dimensions permit. The
   geometry stays pure, so an arrow label's width is estimated at 0.6 em per
   character rather than measured. That covers ordinary Latin, capitals and
   Hebrew, but a label made mostly of unusually wide glyphs can exceed the
   estimate and be cropped at its ends. When framing is enabled, a placement
   that does not cover every slide edge is recomputed inside an inset that scales
   with the slide's shorter side, using 56 px at the 720 px reference size, and
   its image receives counter-scaled rounded corners and a shadow. A covering
   image stays unframed, and the annotation layer remains unclipped. The styled
   player gives its stage and rail slide canvases a white background by default;
   a host can set `--segnavia-shot-backdrop`, while the headless stage remains
   transparent.
3. HTML goes into a frame through `frameDocument`. The CSP and the bridge
   come first, before anything the author wrote. Under `scripts: 'refuse'`
   the policy admits only the bridge's nonce. The bridge handles in-page link
   clicks inside the frame and relays nothing for them: with `base-uri 'none'`,
   an `srcdoc` frame otherwise resolves `#id` against its parent's URL.
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
8. In page-key mode, arrows and page keys work outside form fields, Space has no deck action, and Escape ends an in-window presentation. `m` toggles mute, `c` toggles viewer-controlled captions, and `f` returns `present` for the host to handle. These three letters are ignored when typed into an input, textarea, select or editable element, in the page listener, the player and keys relayed from a slide frame. `present(element)` marks the chosen element with `data-presenting`, locks body overflow and uses `--segnavia-backdrop`; `stopPresenting`, stage disconnection and controller destruction restore it. `<segnavia-fullscreen>` uses this window-presentation path by default; `mode="native"` opts into the browser Fullscreen API.
9. `fit="viewport"` scales from the stage's unscaled inline space and `window.innerHeight`, subtracting its block-start edge and `reserve` at both block edges. While presenting it uses the presented element's block size. It reports `{ scale, width, height }` through `fitted` and `segnavia-fit`; window, visual-viewport and stage resizes trigger a new measurement. A responsive player uses full width: `fit="height"` and presentation fill their available height, `fit="contain"` fills visual-viewport height minus `--segnavia-fit-reserve` and the player's own chrome (caption, bar, `.below`, stacked rail), and `fit="width"` gets height from the deck aspect ratio. Fixed players retain their scaled sizing.
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

A `Book` is either continuous, where the screen is one scrolling flow, or paginated, where a page size and mirrored top, bottom, inner and outer margins are required. It contains optional front-matter entries and one or more chapters. A front-matter entry is either an authored section or the single generated contents entry, whose position in the array places it in the book. Chapters carry HTML and may replace their title in running heads. Front-matter sections can opt out of the contents, while chapters are always included; chapter headings are included through contents depth 2 by default, configurable from 1 through 6, and contents page numbers can be omitted.

Page numbering is set separately for front matter and the body, while footnote and endnote markers have their own settings. Hebrew (`he` or `iw`) defaults to Arabic front-matter numbers, Hebrew body numbers and Hebrew footnote markers. Other languages default to lower-case Roman front-matter numbers, Arabic body numbers and symbol footnote markers. Endnote markers default to Arabic in every language. Footnotes restart by chapter unless set to run through the book; endnotes belong at the end of the book unless a paginated book places them at the end of each chapter. The endnotes title defaults to "הערות" for Hebrew and "Notes" otherwise, and can be replaced by the book.

A paginated book without a page is refused. More than one contents entry is refused. Front matter and the body cannot use the same numbering system, chapter endnotes require paginated mode, and page margins must leave a text area. The remaining refusal depends on content: once the HTML reader knows that both footnotes and endnotes are used, it applies `noteMarkerIssues` to require different markers; `Book.parse` cannot apply that rule without scanning HTML. `bookDocument` builds the ordered sections, generated contents, footnote blocks and endnotes as one pure HTML transform.

`bookPdf` prints a continuous book with a page setting. It prints the body first to locate every destination, inserts blank pages when recto openings are enabled, and checks a second body print against that prediction. Each chapter, and body page 1, then opens on a recto: the right-hand page of a left-to-right book and the left-hand page of a right-to-left book; in both directions it is an odd body page. It prints the front matter once with width-appropriate contents placeholders and again with its final front- and body-page numbers, refusing if a front destination moves. An odd front matter then receives a trailing blank. A separate Chromium print supplies folios and running heads in the top and bottom margins; opening and blank pages omit the running head, and blank pages omit the folio. The renderer overlays that margin layer, joins front and body, and rewrites contents and note links to explicit destinations before applying the standard effects, press and limit passes.

## How a shot is made

The default capture viewport is 1280×720, the same aspect ratio and size as
the default deck canvas. Capturing at the deck's aspect ratio therefore needs
no fitting; image and shot fit is for captures whose shape intentionally
differs from their deck.

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

The notes layout belongs to the slide whose number it carries. It uses the
slide's speaker notes when present and falls back to narration text only when
speaker notes are absent. A slide whose notes fall back to narration counts as
having notes. When some slides have notes and others do not, each empty slide
prints the `noSpeakerNotes` label (English default "No speaker notes") in the
notes box, whose `dir="auto"` follows the label; when no slide has notes, the
notes area stays empty. A host overrides the label through `PrintOptions.labels`
or `PlayerLabels`. Its first paper carries the slide thumbnail and the
start of the notes; overflow continues on notes-only papers marked with the
same slide number and “continued”. The browser print document and `deckPdf`
share that pagination and ownership, so a thumbnail is placed only on its
slide's first notes paper and no notes are clipped. The thumbnail is bounded by
both paper axes so even a tall deck leaves a visible notes area. Library-written
numbering and continuation text are isolated, while the notes resolve their own
direction from their content. `printableDeck` and `printDeck` write an escaped
`<title>` from `options.title` or the deck title into the slides, notes and
imposed documents, and omit the tag when that title is empty. Browser hosts bound accepted notes before
printing with `exceedsLimits` and `maxNotesBytes`; the renderer also stops notes
pagination at its `maxSheets` limit.

Every sandboxed slide document used for printing receives
`print-color-adjust: exact` and `-webkit-print-color-adjust: exact` itself;
putting those properties only on the containing print document cannot cross a
frame boundary. A URL slide keeps its own print styling; color-adjust injection
covers only the slide documents the library builds. Chromium still omits those backgrounds in printed output, so
the browser dialog is best effort and `deckPdf` is the faithful path. The
sandbox remains without same-origin access. Browser printing waits for slide
readiness and fonts only until one shared deadline, then crosses a
two-animation-frame paint barrier before opening the dialog. The off-screen
host stays alive until `afterprint`, with a bounded fallback for engines that
do not dispatch it; a host-provided print hook remains synchronous for
deterministic integration paths. The outer print document contains no inline
script: host-context code paginates notes and places natural images after
readiness, so a strict host content security policy cannot disable either.

**Sideways overflow.** On screen, content that overflows a page sideways is
clipped at the page edge. Chromium's print path instead shrinks the whole page
to fit it. A render at a fixed size (a page with a fixed width and height and
no print paper, each deck slide, each imposed piece) therefore prints with
paint containment on its root, so the overflow is clipped as on screen and the
page keeps its own scale. A growing or fluid page and a page printed on paper,
including each kept book print, instead measure sideways overflow under print
media after the page is ready and its fonts have loaded. Physical rightward
overflow uses a solved print scale. Chromium lays a print with scale `s` out at
the narrower width `P / s`, then shrinks it by the lesser of the content ratio
and its measured maximum shrink of 1.5. The renderer searches integer layout
widths between `ceil(P / 1.5)` and `P` for the narrowest width whose rightward
content reaches `P`, then uses `P / width`; if content already reaches `P` at
the narrowest layout it uses exactly 1.5. This accounts for page-relative
content whose overflow changes with the layout width. Only content Chromium
would show counts: an element clipped by an ancestor (one whose `overflow-x` is
not `visible`, or with paint containment, a `clip-path` or a legacy `clip`)
counts only up to that ancestor's clip edge, and under `overflow: clip` the edge
extends by `overflow-clip-margin`. So content that runs into a page's own bleed
and is clipped there prints at the screen's size. Physical leftward
overflow is not shrunk and gets no counter-scale. In a right-to-left root,
generated content overflowing rightward is a known limit because neither
scroll extent nor element boxes expose it, so it cannot be detected. The
content keeps its true size, overflow is clipped at the page edge, and fixed
content can still repeat on every paper. The overflow report records the page
width, extent, clipped amount at each edge, scale used and up to twenty
contributing elements for every print retained in the output; it names an
element that runs past the page even when an ancestor clips it. The deck's
printable document does not counter-scale because its contained, fixed slides
are the printed pieces.

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
C's RGB samples to the destination space without reporting them as authored RGB images.

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
through the profile. With a CMYK profile, a black or near-neutral gray becomes black ink alone, so text
prints sharp. `press.neutralTolerance` sets the largest channel difference treated
as neutral in 8-bit units from 0 to 255 and defaults to 3; 0 keeps the exact-neutral
rule, and every tolerance also snaps what that rule snaps. It is validated but has no effect with a greyscale profile: every color goes through that profile so its dot gain applies. The CMYK black ink amount is one minus the mean of the RGB channels. Non-mask transparency groups use the destination space. Under a greyscale destination every group is DeviceGray; colors in alpha and luminosity mask sources instead use the PDF luminosity formula, with no profile dot gain, because they represent opacity. Under a CMYK
destination, raster images, including images drawn by Type 3 glyphs such as
color emoji, stay byte-for-byte as the author supplied them and are the only
RGB the result may retain. Under a greyscale destination, supported supplied
images are rewritten as DeviceGray through the profile; images inside mask
sources instead use PDF luminosity so opacity does not receive dot gain.
`press.report.destination` says whether the output is `cmyk` or `gray`, and
`press.report.convertedImages` counts supplied raster objects converted to DeviceGray. The report also receives residual images' pixel dimensions and color-space kinds, plus
counts of converted fills, strokes, gradient stops, sampled shadings and groups read back from
the finished PDF, and the number of conversions snapped to black by the configured
tolerance beyond the exact-neutral rule. An unfamiliar color operator, function, group or stream
filter is refused by name rather than left in RGB. Function-based shadings are
converted by sampling their calculator program onto a type 0 function in the destination space,
8 bits per sample, capped at `MAX_SHADING_SAMPLES` (1 048 576). Painted bounds are
gathered for the whole document in a pass before any conversion, under its own
`MAX_DOCUMENT_CONTENT_BYTES` budget. That pass replays each page's Contents in
order every time a stream appears, and walks resources reached from content
(forms, Type 3 glyphs, tiling patterns, soft masks) with a fresh tracker. The
tracker unions fill and stroke path boxes after the content CTM (strokes grown by
the current line width, join and miter). For each use of a shading, that
rectangle maps through the inverse of (pattern `/Matrix` times shading
`/Matrix`) and intersects the shading Domain; the union over every use becomes
both the Type 0 function's Domain and the shading's own Domain. The two are kept
equal because a Type 1 shading's Domain must lie within its function's (ISO
32000-1, Table 79); a reader that enforces it, such as Ghostscript, drops a
pattern whose function covers less than its shading. The sample grid
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
embeds the same profile with `/GTS_PDFX` and `/N 4` for CMYK or `/N 1` for greyscale, so a press interprets the device numbers
through the profile that made them. For greyscale output, the renderer supplies the press library with
a JPEG decoder backed by one offline Chromium tab per render; the browser only
decodes JPEG bytes, while the library owns profile conversion and PDF rewriting.
The input byte ceiling is checked before
the rewrite, and the existing sheet and byte limit enforcement runs afterward,
so limits also measure the bytes and pages actually returned. Profile reads are bounded by
`MAX_PROFILE_BYTES` (32 MiB) and `MAX_PROFILE_TAGS` (256). Every inflated
content stream is bounded by `MAX_CONTENT_BYTES` (32 MiB) before tokenization.
One rewrite or read-back pass is bounded by `MAX_DOCUMENT_CONTENT_BYTES` (128
MiB) across all decoded content streams, and rewritten streams are compressed
again before the PDF is saved. `MAX_OPERANDS` (32) bounds the operands retained
while the tokenizer waits for an operator. Every PDF the renderer loads with
pdf-lib, including each slide or piece it embeds, first passes `loadPdf`, which
inflates each object stream and cross-reference stream with a running limit of
`MAX_PDF_STREAM_BYTES` (16 MiB) and refuses one that would pass it before
pdf-lib parses the file.

Under a greyscale destination a supplied image may be DeviceRGB, DeviceGray,
ICCBased with one or three components, or Indexed over one of those. It may be
uncompressed, FlateDecode with no predictor or a PNG predictor, or DCTDecode,
at 8 bits per component, or 1, 2, 4 or 8 for Indexed, with the default Decode
array. Anything else is refused by name. A Flate image inflates to at most its
exact decoded size. A JPEG that the renderer's browser cannot decode is refused
with the browser's message. `MAX_IMAGE_PIXELS` (50 000 000) bounds one image,
and `MAX_TOTAL_IMAGE_PIXELS` (400 000 000) bounds all images converted in one
render. An image painted both normally and inside a mask source gets a profile
variant for the page and a luminosity variant for the mask. One used only in
mask sources is replaced by its luminosity variant. No RGB copy is left in the
file either way.

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

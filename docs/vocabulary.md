# Vocabulary

The API uses these words and no others for these things. They were chosen to
read the same in every host, and to avoid words a host already uses for
something else.

| Term | Meaning |
|---|---|
| **Page** | A body of HTML or markdown at any size, designed for viewing on screen: a flowing width, a fixed width and height, or an exact width that grows with its content. |
| **Page body** | A page's content in HTML or markdown. Markdown is a body format, not a type: the asset types remain page, deck, book and board. |
| **Flowing width** | A page width that grows with its content: `full` follows the viewer, `standard` caps and centers at 1024 CSS pixels, `wide` caps and centers at 1440 CSS pixels, and a number is an exact width. Named caps reflow below their measure. A host may override the two named measures. Legacy `fluid` page data reads as `full`. |
| **Cover** | A page with scripts refused and no bleed, safe area or marks, designed to represent an asset at thumbnail size. Its sheet follows its print setting and defaults to 160 × 100 mm when that setting is absent. |
| **Designed cover** | An optional custom cover supplied by a host for an asset. A host-kept picture of that cover is preferred, followed by drawing its page live in a script-refusing frame; when the cover is absent, the asset keeps its existing cover or thumbnail behavior unchanged. |
| **Bounded** | A `full` `<segnavia-page>` with `bounded` takes the box the host sizes and scrolls inside its own frame. Fixed and measured pages ignore it; composed papers always take that host-sized box regardless of `bounded`. |
| **Print** | The press geometry of every printable Document. Bleed, safe area and marks apply to pages, printed pages, deck slides, deck notes sheets and book pages. Paper, orientation and margin apply only when the kind's trim is a paper; a deck's trim is its slide and a book's trim is `page.paper`. |
| **Named paper** | A trim preset: `letter`, `legal`, `tabloid`, `a0`–`a6`, `dl`, `half-letter`, `business-card-us`, `business-card-eu`, `business-card-square-us`, `business-card-slim-us`, `postcard-4x6`, `postcard-5x7`, `postcard-6x9`, `postcard-6x11`, `card-square-4in`, `rack-card-4x9`, `rack-card-3.5x8.5`, `poster-12x18`, `poster-16x20`, `poster-18x24` or `poster-24x36`. Names carry a size or region because printers use “standard”, “large” and “euro” for different sizes. |
| **Trim** | The finished size of a printed piece after cutting: a page's paper, a book's `page.paper`, a deck's slide size or a notes sheet's `notesPaper`. |
| **Bleed** | The distance a page's background continues past the trim, so a cut that drifts leaves no white edge. |
| **Safe area** | The distance inside the trim that text keeps clear of. |
| **Marks** | Crop marks drawn outside the bleed, showing where to cut. |
| **Imposition** | How many pages are placed on one paper: the paper, a grid of cells, how the cells fill, and whether there are two sides. A label template is an imposition. |
| **Cell** | One place in an imposition's grid. It holds one page, shown at the cell's size. |
| **Side** | The front or the back of a paper. The back is flipped on the long or the short edge. |
| **Panel** | A cell of a folded piece, between two folds or a fold and an edge. |
| **Imposition fit** | How a fixed page is shown in a cell of another shape: `contain` shows all of it, `cover` fills the cell and crops. |
| **Counter-scale** | A solved PDF print scale that cancels Chromium's overflow shrink. It is found from the content extent at narrower layout widths and capped at Chromium's measured maximum shrink of 1.5. |
| **Stage fit** | Which space a stage fits its slide into: `box` uses the stage's own box, while `viewport` uses the available window after reserved room. |
| **Fit (slide)** | How image or shot content occupies its slide: `contain` shows the whole image, `cover` fills and crops, `width` fills the width from the top, and `focus` adjusts a covering crop until every annotation is visible. A slide fit overrides the deck fit. |
| **Layout (deck)** | How screen slide canvases are sized: `fixed` lays them out at the deck size and scales them, while `responsive` lays them out at the stage's real box size without scaling. Rail thumbnails, standalone thumbnails and print remain fixed at the deck size. |
| **Frame (slide)** | An inset card treatment for image or shot content that does not cover its slide, with rounded corners and a shadow. A slide frame setting overrides the deck frame setting. |
| **Press profile** | The CMYK or greyscale ICC profile of the press a piece is printed on. The host supplies it. A PDF render writes the matching CMYK or DeviceGray destination and embeds the profile as its output intent. Supplied images stay in RGB for CMYK and are converted through a greyscale profile for DeviceGray. |
| **Proof** | An image of a page as it will look in the press's inks. A guide, not a contract proof. |
| **Slide** | A page whose canvas follows the deck's layout: the deck size under `fixed`, or the stage's box under `responsive`. Print, rail thumbnails and standalone thumbnails always use the deck size. A slide has optional notes and narration. A narrated slide may pause for `beforeMs` and `afterMs`; an unnarrated slide may have `holdMs`. Each playback timing is 0–600000 milliseconds. An optional nonnegative `printAtMs` chooses the frozen animation time used for printing; it defaults to 0. Its content is HTML, a host-served URL, a shot, a shot named by reference, an image, or placed media. |
| **Deck** | An ordered set of slides on one canvas size (`DECK_SIZE`, 1280×720, unless set), with optional `playback` (`segmented` or `continuous`: both play through the deck, and differ only in whether the track draws a segment per slide or one seek bar; `step`, the earlier name, still parses as `segmented`) and caption policy (`on`, `off` or `viewer`). |
| **Board** | An asset that places referenced decks, pages, papers, books, media and shots on an unbounded surface, alongside text labels and titled sections. Its item order is its print and auto-arrange order; each item keeps a free position and width while its height follows the intrinsic shape supplied by the host. |
| **Board list** | `<segnavia-board-list>`: a headless, searchable list of a board's items, grouped by section, that reveals its selected item or section on the board. |
| **Book** | A long document made of optional front matter and one or more chapters, in continuous or paginated mode. |
| **Chapter** | A titled part of a book, with HTML and an optional replacement title for its running head. |
| **Front matter** | The optional entries before a book's chapters. Each is either an authored section with optional title and contents opt-out, or the generated contents entry. |
| **Contents entry** | A front-matter entry that places the generated table of contents at that position; it may have a title but has no authored HTML. |
| **Book page** | The trim, orientation and mirrored margins used by a paginated book. With `rectoOpenings`, each chapter and body page 1 opens on an odd-page recto: right-hand in a left-to-right book and left-hand in a right-to-left book. |
| **Number system** | The Arabic, lower- or upper-case Roman, or Hebrew system used for book page numbers and note markers. |
| **Note marker** | The number system or symbol sequence that identifies a footnote or endnote. |
| **Untimed slide** | A slide with neither narration nor `holdMs`. Playback stops there until Play advances. |
| **Timed slide** | A narrated slide or an unnarrated slide with `holdMs`. Its clock advances to the next slide when it ends. |
| **Deck timeline** | Each slide's deck-wide start and duration plus the timed total. Untimed slides are marked and add zero to the total. |
| **Narration** | A slide's voice track: text, words with timings, optional audio, cues. It can be live, meaning the browser speaks it and learns the timings as it goes. |
| **Cue** | An annotation shown from a spoken word until the slide ends, or until a later word. |
| **Shot** | A captured screen of a real app: a clean image, optionally an annotated rendition, and the annotations measured on that same image. |
| **Annotation** | A ring, numbered badge or labeled arrow, measured on one element at capture time, in the shot's CSS pixels. |
| **Published shot** | What a host serves at a shot's permanent address: one version's image and its geometry together, so they never disagree. |
| **Flow** | A host's scripted path through its app, in named steps, taking shots. |
| **Host** | An app that uses the library, through the seams the library declares. |
| **Frame** | The sandboxed iframe that shows a page's or a slide's HTML. |
| **Controller** | `DeckController`: the headless deck. It holds slide and deck time, playing state, word, annotations, progress, direction, playback mode, mute and caption visibility, and answers keys. It renders nothing. |
| **Stage** | `<segnavia-stage>`: shows the controller's current slide, scaled to fit, and brings no appearance of its own. |
| **Paper** | `<segnavia-paper>`: shows one paper of imposed pages, scaled to fit, and brings no appearance of its own. |
| **Styled component** | One finished control (`<segnavia-play>`, `-step`, `-track`, `-counter`, `-time`, `-mute`, `-captions`, `-caption`, `-notes`, `-fullscreen`). It finds its deck by `for`, by its `controller` property, or from the nearest ancestor that has one. Fullscreen presents in-window by default and offers native browser fullscreen through `mode="native"`. |
| **Player** | `<segnavia-player>`: the finished player, a layout of the styled components around a stage. |
| **Reading direction** | The deck's direction, from its `dir`, else its `lang`, else its title's first strong letter. Paging keys and the skin follow it. |
| **Bridge** | The small script of the library's own that runs inside every frame. It relays paging keys, reports height and signals when the frame is painted. Only where author scripts are refused, it answers a selection request from its parent. |
| **Bindings** | `data-<prefix>-*` attributes that fill a page from data with no script. The prefix is the host's. |
| **Slot** | A declared dotted binding path on a reusable page or deck. Slot HTML uses the fixed `slot` binding prefix; its declaration gives the host a label, type, required flag and optional placeholder. |
| **Fill** | One named set of slot values applied before a viewer, thumbnail or print frame is built. Image values may name a host-resolved asset. |
| **Motif** | Reusable designed HTML and CSS that a host supplies by key and a page places in its own markup. It may declare fields, fonts and language versions. |
| **App font** | A face the host ships, named by the host (`serif`). Page and motif CSS write `var(--segnavia-font-<name>)` and never spell the family. The library defines that property from the host's `FontSource`. |
| **Local font** | A face installed on the author's machine, named by its family with an app-font fallback. The page's named faces may be sent with one server render as JSON-safe base64; they are never kept, cached, logged or served. A viewer without the face sees the fallback and is told, never blocked. The notice is the host's chrome and is never printed into the page or the PDF. |
| **Brand** | A host-kept `StyleSheet` that a document names by `brand` and the host resolves through `BrandSource`. It is layered under the document's own style and is never stored in the document. A board's brand is the default for each item that names none. |
| **Font manifest** | The fonts a document declares, at `style.fonts`, keyed by font name: an app font with the faces it is set in (weight, style, range, and `script: 'hebrew'` for a Hebrew face), or a local font with its app-font fallback. |
| **Font failure** | A declared face that the host did not supply (`unsupplied`) or that Chromium did not load (`unloaded`). It is reported and composition continues at the fallback. |
| **Motif placement** | An element with `data-motif` and optional motif field attributes. Expansion keeps the element and replaces its children with the chosen motif version. |
| **Placement** | One asset placed in another, naming the placed asset and the settings belonging to this use. |
| **Placeholder** | The plain bordered image drawn when a placed asset is invalid, missing, refused or fails to resolve. |
| **Imposition placement** | The physical position where one page lands on a printing paper. |
| **Motif version** | One rendition of a motif, keyed by values of its choice fields and chosen by most-specific match. |
| **Parent page** | Named inherited print geometry and head or foot motif regions selected by a role for a flowing page. |
| **Printed page** | One physical page produced by fragmenting a flowing page; it has a side, parent page, formatted number and total. |

## Words the API avoids

| Avoided | Why |
|---|---|
| document, doc | Most apps already use it, and in one host it is the kernel record. |
| sheet, outside `limits.sheets` | One host's design system uses it for the side-panel component. The `limits.sheets` field counts PDF pages; a two-sided paper counts as two. |
| surface | One host uses it for which app you are in. |
| tutorial, video | A deck that plays is still a deck. A tutorial is not a separate thing. |
| paper, as a property of a page | A `Page` has no paper; paper belongs only to its print setting. A paginated `Book` names its trim on its book page. |

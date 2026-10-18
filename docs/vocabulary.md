# Vocabulary

The API uses these words and no others for these things. They were chosen to
read the same in every host, and to avoid words a host already uses for
something else.

| Term | Meaning |
|---|---|
| **Page** | Self-contained HTML at any size, designed for viewing on screen: fluid (the viewer's width, as tall as its content), a fixed width and height, or a fixed width that grows with its content. |
| **Print** | An optional setting on a page: a paper (named or custom, in mm, inches or points), an orientation, margins, bleed, safe area and marks. Used only when exporting to a standard printed size. Without it, a page exports at its own size. |
| **Trim** | The finished size of a printed page after cutting. It is the print setting's paper. |
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
| **Slide** | A page whose canvas follows the deck's layout: the deck size under `fixed`, or the stage's box under `responsive`. Print, rail thumbnails and standalone thumbnails always use the deck size. A slide has optional notes and narration. A narrated slide may pause for `beforeMs` and `afterMs`; an unnarrated slide may have `holdMs`. Each timing is 0–600000 milliseconds. Its content is HTML, a host-served URL, a shot, a shot named by reference, or an image. |
| **Deck** | An ordered set of slides on one canvas size (`DECK_SIZE`, 1280×720, unless set), with optional `playback` (`step` or `continuous`) and caption policy (`on`, `off` or `viewer`). |
| **Canvas** | An asset that places referenced decks, pages, papers, books, images and shots on an unbounded surface, alongside text labels and titled sections. Its item order is its print and auto-arrange order; each item keeps a free position and width while its height follows the intrinsic shape supplied by the host. |
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
| **Bridge** | The small script of the library's own that runs inside every frame. It relays paging keys, reports height and signals when the frame is painted. |
| **Bindings** | `data-<prefix>-*` attributes that fill a page from data with no script. The prefix is the host's. |

## Words the API avoids

| Avoided | Why |
|---|---|
| document, doc | Most apps already use it, and in one host it is the kernel record. |
| sheet | One host's design system uses it for the side-panel component. The legacy render limit name `maxSheets` counts PDF pages; a two-sided paper counts as two. |
| surface | One host uses it for which app you are in. |
| tutorial, video | A deck that plays is still a deck. A tutorial is not a separate thing. |
| paper, as a property of a page | A `Page` has no paper; paper belongs only to its print setting. A paginated `Book` names its trim on its book page. |

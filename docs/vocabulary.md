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
| **Fit** | How a fixed page is shown in a cell of another shape: `contain` shows all of it, `cover` fills the cell and crops. |
| **Press profile** | The ICC profile of the press a piece is printed on. The host supplies it. With one, a render writes CMYK. |
| **Proof** | An image of a page as it will look in the press's inks. A guide, not a contract proof. |
| **Slide** | A page with a fixed canvas that belongs to a deck, with optional notes and optional narration. Its content is HTML, a host-served URL, a shot, a shot named by reference, or an image. |
| **Deck** | An ordered set of slides on one canvas size (`DECK_SIZE`, 1280×720, unless set). |
| **Static slide** | A slide without narration. You page through it. |
| **Playing slide** | A slide with narration. The narration sets its length, its cues show annotations, and it moves on by itself. |
| **Narration** | A slide's voice track: text, words with timings, optional audio, cues. It can be live, meaning the browser speaks it and learns the timings as it goes. |
| **Cue** | An annotation shown from a spoken word until the slide ends, or until a later word. |
| **Shot** | A captured screen of a real app: a clean image, optionally an annotated rendition, and the annotations measured on that same image. |
| **Annotation** | A ring, numbered badge or labelled arrow, measured on one element at capture time, in the shot's CSS pixels. |
| **Published shot** | What a host serves at a shot's permanent address: one version's image and its geometry together, so they never disagree. |
| **Flow** | A host's scripted path through its app, in named steps, taking shots. |
| **Host** | An app that uses the library, through the seams the library declares. |
| **Frame** | The sandboxed iframe that shows a page's or a slide's HTML. |
| **Controller** | `DeckController`: the headless deck. It holds the state (slide, playing, word, annotations shown, progress, direction) and answers keys. It renders nothing. |
| **Stage** | `<segnavia-stage>`: shows the controller's current slide, scaled to fit, and brings no appearance of its own. |
| **Styled component** | One finished control (`<segnavia-play>`, `-step`, `-track`, `-counter`, `-caption`, `-notes`, `-fullscreen`). It finds its deck by `for`, by its `controller` property, or from the nearest ancestor that has one. |
| **Player** | `<segnavia-player>`: the finished player, a layout of the styled components around a stage. |
| **Reading direction** | The deck's direction, from its `dir`, else its `lang`, else its title's first strong letter. Paging keys and the skin follow it. |
| **Bridge** | The small script of the library's own that runs inside every frame. It relays paging keys, reports height and signals when the frame is painted. |
| **Bindings** | `data-<prefix>-*` attributes that fill a page from data with no script. The prefix is the host's. |

## Words the API avoids

| Avoided | Why |
|---|---|
| document, doc | Most apps already use it, and in one host it is the kernel record. |
| sheet | One host's design system uses it for the side-panel component. "Printed sheet" appears only in render limits (`maxSheets`), where it means a sheet of paper. |
| surface | One host uses it for which app you are in. |
| tutorial, video | A deck that plays is still a deck. A tutorial is not a separate thing. |
| paper, as a property of a page | A page has no paper. Paper belongs only to its print setting. |

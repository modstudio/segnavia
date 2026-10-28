# Screen-to-PDF fidelity fixtures

Run `bun run fidelity baseline` to write a labeled, commit-specific run under
`out/fidelity/`. Compare two completed runs with
`bun run fidelity:compare <run-a> <run-b>`; each argument may be a run name or
an output directory. Set `SEGNAVIA_CHROMIUM` when Chromium is not in a standard
Playwright or macOS location. Set `SEGNAVIA_FIDELITY_PROFILE` to an ICC profile
to add a proofed press-profile comparison for every document. On macOS, use
`/System/Library/ColorSync/Profiles/Generic CMYK Profile.icc` for the baseline.

The effects fixtures are realistic combinations rather than isolated effect
tiles:

- `flyer.html`: soft photo-card and text shadows, diagonal and conic gradients, and a translucent overlay.
- `cards.html`: layered and inset shadows, rounded clipping, elevation, and light/dark cards.
- `glass-ui.html`: photo and gradient glass, frosted navigation, and blend-mode text.
- `data-report.html`: SVG gradients, drop shadows and Gaussian blur, transparent area fills, and zebra rows.
- `poster.html`: repeating and radial gradients, mask fades, transparent-PNG drop shadow, and transformed shadows.
- `slide.html`: a 1280×720 gradient slide with glowing type and shadowed screenshots.
- `print-piece.html`: an A5 postcard with 3 mm bleed, a bleed gradient, and a shadow crossing the trim.
- `hebrew.html`: vocalized right-to-left Hebrew, gradients, text shadow, and frosted glass.

The control fixtures carry no gradient, transparency, blend, filter, shadow or
mask, so they test color conversion alone:

- `control-flat.html`: flat saturated, dark, pastel, and brand-like swatches, a grey ramp, borders, and SVG fills and strokes.
- `control-text.html`: English text across 9–64 px and vocalized right-to-left Hebrew on flat light and dark grounds.
- `control-photo.html`: deterministic generated JPEG photographs at three sizes on a flat background; regenerate it with `bun scripts/fidelity/control-photo.ts`.
- `control-book-en.html` / `control-book-he.html`: paginated control books (English; vocalized right-to-left Hebrew), each with footnotes and a paragraph that breaks across a page. The suite registers them as book fixtures, not as single HTML pages.

The Hebrew book's third page is deliberately periodic as the line-registration stress case.

Every measured region has a `data-fidelity` name in its document. The run
summary records whole-page and region differences for each PDF reader, PDF
structure, reader failures, and links to threshold-exceeding side-by-sides.

## Paginated books

A book fixture is compared page by page. The suite prints one PDF with
`bookPdf`, splits it with pdf-lib into single-page documents, and sends each
page to the existing readers unchanged. The screen reference is the paginated
view (`screen: { spread: false }`) at scale 1; each `[data-segnavia-book-page]`
is screenshotted. Page ids are `<book-id>/pNN` (two digits from 01). A
page-count mismatch between screen papers and PDF pages fails the book and
names both counts; no page is compared.

The control books use a 6×9 in paper (576×864 CSS px). A whole number of CSS
pixels keeps every paper's size and origin on the pixel grid at the suite
scale, so the PDF raster is not resampled. A fractional paper (for example A5
at 793.7 CSS px) is resampled when compared, which measures the rasterizer
rather than the screen-to-PDF match. The run refuses unless each paper's box
is exactly that CSS size at scale 1 and each screenshot is that size times
the suite scale.

Book pages are kind `book`. They are gated by line registration of the body
text window (row and column ink profiles: best |d| over ±12 device px, an
eighth of a 96 px line pitch, must be ≤ 1 device px; nL1 at zero shift ≤ 0.15),
by whole-page press and gray mean at the `PRESS_BLEND_THRESHOLD` mean, and by
the size bar on the whole book PDF. The ±12 search catches sub-line drift; nL1
at zero catches a whole-line shift, which a wider search can prefer on
periodic text. Whole-page p99 is reported, not gated: on dense text it tracks
glyph-edge anti-aliasing, not a geometric miss. Text color stays gated by
`control-text`. Unshifted pages measured best dy 0 or -1 with nL1 at 0 at most
0.0723; the one-line fault measured dy 95-96 with nL1 at 0 of 0.284-0.312.

The PDF size bar is measured once on the whole book against its effectless
counterpart and shown once for the book.

`control-book-en-shifted` is a standing fault control: the same English book,
with the text window of body page 02 shifted by one line pitch in a PDF-only
`beforeOutput`. The screen is unshifted. Only that page is compared. The run
fails if that page passes the registration bar. The report labels it as a fault
control, prints its registration numbers, and names the bars it fails.

The run exits non-zero when a book page fails a bar or the fault control
passes. Page fixtures are reported in the summary and never change the exit
code.

Set `SEGNAVIA_FIDELITY_OUT` to write runs somewhere other than `out/fidelity/`,
for example a folder that outlives a throwaway worktree.

## Readers

Each PDF is read by every reader in the registry in `scripts/fidelity/readers.ts`:
Poppler (`pdftoppm`), CoreGraphics (`sips`, matched to sRGB), Chromium's PDF
viewer, Adobe's PDF engine through Photoshop, and Ghostscript (`gs`). A reader
whose tool is missing is skipped with its reason, and a skipped reader fails the
effects bar. The Adobe reader drives Photoshop through `osascript`, so the
session running the suite must be allowed to control Photoshop (System
Settings → Privacy & Security → Automation);
`osascript -e 'tell application "Adobe Photoshop 2026" to do javascript "1+1"'`
printing `2` is the check. The Harlequin RIP engine is not covered.

## Registration

`MEASUREMENT_CSS` draws a fixed marker in each page's corner. Every reader's
raster is registered on that marker before it is compared, and a reader whose
marker match scores above `MARKER_MATCH_MAX_SCORE`, or sits more than
`ALIGNMENT_TOLERANCE` device pixels off, fails rather than being compared.
Offsets are reported, never applied.

## Acceptance bars

The bars live in `scripts/fidelity/config.ts`, except `EFFECT_REGION_THRESHOLD`,
which the rendering verification shares and `scripts/verify/pixel-difference.ts`
owns. Control documents are judged on
the whole page against `PRESS_COLOR_THRESHOLD` (mean ≤ 3, p99 ≤ 30), for both
CMYK and grey; a blended mask over 1% also fails a control. Effects documents
are judged on the whole page against the `PRESS_BLEND_THRESHOLD` regression
ceiling (mean ≤ 10, p99 ≤ 90), while their blended mask remains report evidence.
The effects regions still use `EFFECT_REGION_THRESHOLD` for effects documents;
that bar is not applicable to controls or books. Book pages reuse the
`PRESS_BLEND_THRESHOLD` mean and add the line-registration bar; p99 on a book
page is evidence because on dense text it measures text density rather than
fidelity. `PDF_SIZE_THRESHOLD` applies to every document.

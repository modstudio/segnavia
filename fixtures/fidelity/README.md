# Screen-to-PDF fidelity fixtures

Run `bun run fidelity baseline` to write a labeled, commit-specific run under
`out/fidelity/`. Compare two completed runs with
`bun run fidelity:compare <run-a> <run-b>`; each argument may be a run name or
an output directory. Set `SEGNAVIA_CHROMIUM` when Chromium is not in a standard
Playwright or macOS location. Set `SEGNAVIA_FIDELITY_PROFILE` to an ICC profile
to add a proofed press-profile comparison for every document. On macOS, use
`/System/Library/ColorSync/Profiles/Generic CMYK Profile.icc` for the baseline.

The fixtures are realistic combinations rather than isolated effect tiles:

- `flyer.html`: soft photo-card and text shadows, diagonal and conic gradients, and a translucent overlay.
- `cards.html`: layered and inset shadows, rounded clipping, elevation, and light/dark cards.
- `glass-ui.html`: photo and gradient glass, frosted navigation, and blend-mode text.
- `data-report.html`: SVG gradients, drop shadows and Gaussian blur, transparent area fills, and zebra rows.
- `poster.html`: repeating and radial gradients, mask fades, transparent-PNG drop shadow, and transformed shadows.
- `slide.html`: a 1280×720 gradient slide with glowing type and shadowed screenshots.
- `print-piece.html`: an A5 postcard with 3 mm bleed, a bleed gradient, and a shadow crossing the trim.
- `hebrew.html`: vocalized right-to-left Hebrew, gradients, text shadow, and frosted glass.

Every measured region has a `data-fidelity` name in its document. The run
summary records whole-page and region differences for each PDF reader, PDF
structure, reader failures, and links to threshold-exceeding side-by-sides.

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

The bars Shmuel agreed live in one table in `scripts/fidelity/config.ts`:
effects within `EFFECT_REGION_THRESHOLD` of the screen in every region and
every reader; press color within `PRESS_COLOR_THRESHOLD` of the proof of the
screen; and PDF size within `PDF_SIZE_THRESHOLD` of the same page with its
effects removed.

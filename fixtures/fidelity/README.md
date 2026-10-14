# Screen-to-PDF fidelity fixtures

Run `bun run fidelity baseline` to write a labeled, commit-specific run under
`out/fidelity/`. Compare two completed runs with
`bun run fidelity:compare <run-a> <run-b>`; each argument may be a run name or
an output directory. Set `SEGNAVIA_CHROMIUM` when Chromium is not in a standard
Playwright or macOS location. Set `SEGNAVIA_FIDELITY_PROFILE` to an ICC profile
to add a press-profile `pagesPdf` result for the print piece.

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

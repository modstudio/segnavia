# Continuous integration

The `CI` workflow runs for every pull request to `main` and every push to
`main`. Its required job name is `Check and browser verification`.

The job installs the locked dependencies, runs the repository check, builds
the browser demo, verifies that demo in Chromium, and verifies rendering in
Chromium under both Bun and Node. CI installs Chrome for Testing and passes its
executable path to the demo and rendering scripts through
`SEGNAVIA_CHROMIUM`. It also installs ffmpeg, which the demo build uses to make
its narration test tone, and poppler, whose PDF tools the verify scripts use to
read what they render. It runs on macOS because Ubuntu's poppler (24.02) draws
sampled shadings differently from the current release the press-colour checks
are calibrated against. The fidelity scripts (`bun run fidelity`) use
macOS tools and are not part of CI.

The PHP host fixture is not part of CI. It needs a separate Composer install
and does not add coverage to the Bun and Node browser verification performed
by the required job. Run `bun run setup:php` and `bun run demo` locally to
include that fixture.

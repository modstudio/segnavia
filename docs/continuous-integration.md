# Continuous integration

The `CI` workflow runs for every pull request to `main` and every push to
`main`. The only required check is the final `CI passed` job. It reports
success only when every job below succeeds:

- `check` installs the locked dependencies and runs `bun run check` on Ubuntu.
- `build-demo` installs ffmpeg, builds the browser demo on Ubuntu, and uploads
  `out/` for the verifier jobs.
- `verify-demo` downloads that build and runs three Ubuntu jobs, each with one
  shard of the browser verification and poppler's PDF tools.
- `verify-render` runs the rendering verification on Ubuntu under both Bun and
  Node. It uses a cached current poppler environment from conda-forge because
  Ubuntu's packaged poppler (24.02) draws sampled shadings differently from the
  current release the press-colour checks are calibrated against.

CI installs Chrome for Testing and passes its executable path to the demo and
rendering scripts through `SEGNAVIA_CHROMIUM`. Each job caches Bun's install
cache by `bun.lock`.

Set `SEGNAVIA_VERIFY_SHARD` to a one-based `index/count` pair to run only that
share of the demo verifier sections. For example,
`SEGNAVIA_VERIFY_SHARD=2/3 bun --conditions=@segnavia/source scripts/verify-demo.ts`
runs the second of three shares. With the variable unset, the script runs every
section in its original order.

The fidelity scripts (`bun run fidelity`) use macOS tools and are not part of
CI.

The PHP host fixture is not part of CI. It needs a separate Composer install
and does not add coverage to the Bun and Node browser verification performed
by the required job. Run `bun run setup:php` and `bun run demo` locally to
include that fixture.

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
  Node, with Ubuntu's poppler and the FOGRA39L press profile from colord-data.
  Poppler draws DeviceCMYK with a fixed model of press inks rather than the
  PDF's output intent, so the press-color checks proof against a profile of a
  real press condition: FOGRA39L, or macOS's Generic CMYK where that is present.

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

## Locally

`bun run check` is the full gate CI runs. It checks repository structure,
formatting and lint with Biome, types, every unit test, package shape, and a
release dry run.

The pre-commit hook runs `bun run check --changed --staged`. The structural,
Biome and type checks still cover the repository. Unit tests run for:

- every package with a staged file, and every transitive dependent declared in
  `architecture.ts`;
- the script tests, when a package is selected (script tests import package
  source), or a file under `scripts/` or `architecture.ts` changed;
- every package and the script tests, for any other path, such as
  `package.json`, `bun.lock`, `tsconfig.json`, `biome.json` or `fixtures/`.

Markdown files and `docs/` select no tests. A rename counts as both its old and
its new path.

Run `bun run check --changed` by hand for the same focused check against the
branch diff from its merge base with `origin/main`. Package-shape checks and
the release dry run normally run only in the full gate; changed mode runs both
when a `package.json` or `scripts/publish.ts` changed.

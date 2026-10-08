# Releasing

All six packages share one version and are released together. Changesets records
the intent of a change and updates versions and changelogs; the release script
packs with Bun and publishes those tarballs with npm.

## Record and version a change

Run `bun run changeset`, select the affected packages, choose the version bump
and write the user-facing summary. Commit the generated changeset with the
change.

When preparing a release, run `bun run version`. This applies every pending
changeset, updates all six packages to the same version, writes their changelogs
and refreshes `bun.lock`. Review and commit those changes.

## Cut a release

Run the **Release** workflow from GitHub's Actions page. It runs the full gate,
then packs each package in dependency order and publishes only versions absent
from npm. A failed workflow can safely be run again: versions already published
are skipped.

Use `bun run release --dry-run` locally to build and inspect what would be
published without publishing it.

## One-time npm setup

A maintainer first publishes every package from a logged-in machine:

1. Run `bun run release` once. It makes the first publication of all six
   packages.

Next, create a GitHub environment named `npm` whose deployment branches are
limited to `main`.

Then, for each package in turn:

1. In the package's npm settings, register a trusted publisher with owner
   `modstudio`, repository `segnavia`, workflow file `release.yml` and
   environment `npm`.
2. Set publishing access to require two-factor authentication and disallow
   tokens.

After every package has this setup, releases use GitHub trusted publishing. The
workflow has no npm token secret.

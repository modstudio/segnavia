# Releasing

All six packages share one version and are released together. Changesets records
the intent of a change and updates versions and changelogs. The release script
packs the packages with Bun in dependency order and publishes those tarballs
with npm.

## One-time setup

A maintainer does these steps once.

1. Sign in to npm and check which account is active.

   ```sh
   npm login
   npm whoami
   ```

   Success: `npm whoami` prints the maintainer's npm account name.

2. Preview the first release.

   ```sh
   bun run release --dry-run
   ```

   Success: the script builds and packs all six packages, then prints one line
   per package ending in `would publish`, without publishing anything.

3. Make the first publication of all six packages from the logged-in machine.

   ```sh
   bun run release
   ```

   npm asks for two-factor approval in the browser during the run. Success:
   each published package prints a line beginning `+ @segnavia/`.

4. Confirm the published version.

   ```sh
   npm view @segnavia/format version
   ```

   Success: npm prints the version that was just published.

5. On the GitHub repository, go to **Settings → Environments → New
   environment**. Enter `npm` as the environment name, then limit its deployment
   branches to `main`.

   Success: **Settings → Environments → npm** shows `main` as the only allowed
   deployment branch.

6. Configure trusted publishing for each package:

   - `@segnavia/format`
   - `@segnavia/html`
   - `@segnavia/frame`
   - `@segnavia/voice`
   - `@segnavia/render`
   - `@segnavia/capture`

   On npmjs.com, open the package and go to **Settings → Trusted Publisher →
   GitHub Actions**. Enter these values:

   | Field | Value |
   | --- | --- |
   | Organization or user | `modstudio` |
   | Repository | `segnavia` |
   | Workflow filename | `release.yml` |
   | Environment name | `npm` |

   Success: every package lists the GitHub Actions workflow as its trusted
   publisher.

7. For each package on npmjs.com, go to **Settings → Publishing access**. Select
   **Require two-factor authentication and disallow tokens**, then save.

   Success: all six packages show that publishing access setting. Releases now
   use GitHub trusted publishing, and the workflow has no npm token secret.

## Every release

1. Record the intent of the change, select the affected packages, choose the
   version bump and write the user-facing summary.

   ```sh
   bun run changeset
   ```

   Success: Changesets writes a changeset file. Commit that file with the
   change.

2. Apply every pending changeset.

   ```sh
   bun run version
   ```

   Success: all six packages have the same new version, their changelogs are
   updated and `bun.lock` is refreshed. Review and commit those changes, open a
   pull request and merge it.

3. Start the release workflow on `main`, then watch it.

   ```sh
   gh workflow run release.yml --ref main
   gh run watch
   ```

   Alternatively, on GitHub go to **Actions → Release → Run workflow**, select
   `main`, and choose **Run workflow**.

   Success: the workflow runs the full gate, packs every package in dependency
   order and publishes only versions absent from npm.

4. Confirm the published version.

   ```sh
   npm view @segnavia/format version
   ```

   Success: npm prints the version released by the workflow.

## When it stops

After setup, a release is always published by the workflow.

- `npm publish … failed.` — A publish failed partway through. Start the workflow
  again on `main`:

  ```sh
  gh workflow run release.yml --ref main
  gh run watch
  ```

  Success: the workflow continues the release; versions already published are
  skipped.

- `<package> still contains workspace: for <dependency>.` — The packed manifest
  contains a leftover workspace range. Refresh `bun.lock`:

  ```sh
  bun install
  ```

  Success: the packed manifest contains a publishable dependency range. Commit
  the refreshed lockfile, open a pull request and merge it, then start the
  workflow on `main`:

  ```sh
  gh workflow run release.yml --ref main
  gh run watch
  ```

  Success: the workflow passes the packed-manifest check and publishes the
  release.

- `Could not establish package dependency order; the workspace dependencies
  contain a cycle.` — Remove the cyclic workspace dependency.

  Success: the package dependency graph has no cycle, so the release script can
  establish a publishing order. Commit the change, open a pull request and
  merge it, then start the workflow on `main`:

  ```sh
  gh workflow run release.yml --ref main
  gh run watch
  ```

  Success: the workflow establishes a publishing order and publishes the
  release.

- `<package>@<version> depends on workspace package … instead of …` — An
  internal dependency is not at the version shared by all six packages. Run:

  ```sh
  bun run version
  ```

  or:

  ```sh
  bun install
  ```

  Success: the internal dependency and `bun.lock` use the shared version.
  Commit the changes, open a pull request and merge it, then start the workflow
  on `main`:

  ```sh
  gh workflow run release.yml --ref main
  gh run watch
  ```

  Success: the workflow passes the dependency-version check and publishes the
  release.

- `<package>@<version> does not match …, the version shared by the other
  packages.` — A package version differs from the others. If changesets are
  pending, run:

  ```sh
  bun run version
  ```

  If no changesets are pending, set the `version` field in all six package
  manifests to the same value, then run:

  ```sh
  bun install
  ```

  Success: all six package manifests have the same version and `bun.lock` is
  refreshed. Commit the changes, open a pull request and merge it, then start
  the workflow on `main`:

  ```sh
  gh workflow run release.yml --ref main
  gh run watch
  ```

  Success: the workflow passes the shared-version check and publishes the
  release.

- `<package>@<version> does not contain LICENSE.` — The packed package is
  missing its licence. Restore `LICENSE` to the package tarball contents,
  commit the change, open a pull request and merge it, then start the workflow
  on `main`:

  ```sh
  gh workflow run release.yml --ref main
  gh run watch
  ```

  Success: packing passes the licence check.

- `Could not reach the npm registry or establish whether the package exists.` —
  The registry could not be reached. Restore npm registry access, then start
  the workflow on `main`:

  ```sh
  gh workflow run release.yml --ref main
  gh run watch
  ```

  Success: the script can establish whether every version is already published.

- `Could not establish npm's integrity for <package>@<version>.` — The registry
  answered without an integrity value. Check the value directly:

  ```sh
  npm view <package>@<version> dist.integrity
  ```

  Success: npm prints an integrity value. Start the workflow on `main` again:

  ```sh
  gh workflow run release.yml --ref main
  gh run watch
  ```

  Success: the workflow establishes the published package's integrity.

- `<package>@<version> has local integrity … but npm has …` — A published
  version differs from the local tarball. Release a new version; published
  package contents cannot be replaced. Follow the version steps under **Every
  release**, commit the changes, open a pull request and merge it, then start
  the workflow on `main`:

  ```sh
  gh workflow run release.yml --ref main
  gh run watch
  ```

  Success: the workflow publishes the new version, whose contents do not
  conflict with an existing npm package.

- `release — Skipped` — The workflow run was not started on `main`. Start it on
  `main`:

  ```sh
  gh workflow run release.yml --ref main
  gh run watch
  ```

  Success: the `release` job runs instead of being skipped.

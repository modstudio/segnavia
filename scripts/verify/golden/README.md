# Structural PDF goldens

The committed JSON files characterize the demo PDFs without comparing pixels. They record each page's size and extracted text, the outline, embedded font names, and stable Info and XMP metadata. Generated Info dates and file sizes are omitted because they change on every render; Chromium platform/version strings, Skia versions, and font subset prefixes are normalized.

Baselines must come from the same Ubuntu environment that checks them. After the release containing an intentional rendering change lands, download the `demo` artifact from its CI run and record that artifact's `out/` tree explicitly:

```sh
gh run download <run-id> --name demo --dir <dir>
bun --conditions=@segnavia/source scripts/verify/golden/record.ts <dir>
bunx biome format --write scripts/verify/golden/fixtures
```

The resulting JSON diff is the golden change to review. The directory argument is optional and defaults to the repository's `out/` directory. A local macOS build is useful for looking at the PDFs, not for recording baselines.

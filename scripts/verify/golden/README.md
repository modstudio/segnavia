# Structural PDF goldens

The committed JSON files characterize the demo PDFs without comparing pixels. They record each page's size and extracted text, the outline, embedded font names, and stable Info and XMP metadata. Generated Info dates and file sizes are omitted because they change on every render; Chromium platform/version strings, Skia versions, and font subset prefixes are normalized.

Baselines must come from the same Ubuntu environment that checks them. After the release containing an intentional rendering change lands, download the `demo` artifact from its CI run and record that artifact's `out/` tree explicitly:

```sh
gh run download <run-id> --name demo --dir <dir>
bun run golden:update <dir>
```

The command requires the downloaded artifact directory and writes formatted JSON directly. The resulting JSON diff is the golden change to review. A local macOS build is useful for looking at the PDFs, not for recording baselines.

The golden check runs only in the Bun leg of CI's `verify-render` job, where it reads the downloaded `demo` artifact with Ubuntu's poppler. `bun run demo` does not run it because platform font names differ on macOS.

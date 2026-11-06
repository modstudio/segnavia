# Structural PDF goldens

The committed JSON files characterize the demo PDFs without comparing pixels. They record each page's size and extracted text, the outline, embedded font names, and stable Info and XMP metadata. Generated Info dates and file sizes are omitted because they change on every render; Chromium platform/version strings, Skia versions, and font subset prefixes are normalized.

After an intentional rendering change, first run `bun run demo` to generate the PDFs and check the existing goldens. Then record the reviewed output explicitly:

```sh
bun run golden:update
```

The resulting JSON diff is the golden change to review.

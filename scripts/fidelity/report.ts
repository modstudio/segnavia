import path from 'node:path'
import type { FidelityRun, RegionResult } from './types.ts'

const decimal = (value: number | undefined): string => (value === undefined ? '—' : value.toFixed(2))
const relative = (root: string, file: string): string => path.relative(root, file).split(path.sep).join('/')

export async function writeSummary(run: FidelityRun, directory: string): Promise<void> {
  await Bun.write(path.join(directory, 'summary.json'), `${JSON.stringify(run, null, 2)}\n`)
  const rows = run.documents.flatMap((document) =>
    document.readers.map(
      (reader) =>
        `| ${document.title} | ${reader.reader} | ${document.pdfBytes.toLocaleString()} | ${reader.worked ? 'yes' : 'no'} | ${decimal(reader.page?.mean)} | ${decimal(reader.page?.p99)} |`,
    ),
  )
  const worst = run.documents
    .flatMap((document) =>
      document.readers.flatMap((reader) =>
        (reader.regions ?? []).map((region) => ({ document: document.title, reader: reader.reader, region, score: region.mean + region.p99 / 255 })),
      ),
    )
    .sort((left, right) => right.score - left.score)
  const failures = run.documents.flatMap((document) =>
    document.readers.filter((reader) => !reader.worked).map((reader) => `- ${document.title} / ${reader.reader}: ${reader.error}`),
  )
  const rasters = run.documents.flatMap((document) =>
    document.analysis.images
      .filter((image) => image.type === 'image' && Math.abs(image.xDpi - 300) <= 1 && Math.abs(image.yDpi - 300) <= 1)
      .map((image) => `- ${document.title}: ${image.width}×${image.height}, ${image.xDpi}×${image.yDpi} dpi, ${image.bytes.toLocaleString()} bytes`),
  )
  const worstLines = worst.slice(0, 12).map(({ document, reader, region }) => {
    const image = region.sideBySide ? ` — [screen | reader](${relative(directory, region.sideBySide)})` : ''
    return `- ${document} / ${reader} / ${region.name}: mean ${region.mean.toFixed(2)}, p99 ${region.p99.toFixed(0)}${image}`
  })
  const markdown = `# Fidelity run: ${run.metadata.label}\n\nCommit: \`${run.metadata.commit}\`. Screen references use device scale factor ${run.metadata.scale}. Side-by-sides are emitted when mean difference exceeds ${run.metadata.threshold.mean} or p99 exceeds ${run.metadata.threshold.p99}; the screen image is on the left.\n\n## Summary\n\n| Document | Reader | PDF bytes | Rendered | Mean | P99 |\n|---|---|---:|:---:|---:|---:|\n${rows.join('\n')}\n\n## Worst regions\n\n${worstLines.join('\n') || 'No region exceeded the reporting set.'}\n\n## Reader failures\n\n${failures.join('\n') || 'None.'}\n\n## Chromium 300 dpi rasters\n\n${rasters.join('\n') || 'None.'}\n`
  await Bun.write(path.join(directory, 'summary.md'), markdown)
}

export function regionKey(document: string, reader: string, region: RegionResult): string {
  return `${document}\u0000${reader}\u0000${region.name}`
}

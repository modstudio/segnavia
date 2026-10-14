import path from 'node:path'
import type { FidelityRun, RegionResult } from './types.ts'

const decimal = (value: number | undefined): string => (value === undefined ? '—' : value.toFixed(2))
const relative = (root: string, file: string): string => path.relative(root, file).split(path.sep).join('/')
const verdict = (passed: boolean): string => (passed ? 'PASS' : 'FAIL')

function barRows(run: FidelityRun): string[] {
  const thresholds = run.metadata.thresholds
  const documents = run.documents.map((document) => {
    const effect = document.bars.effects.measured
    const press = document.bars.pressColor.measured
    return `| ${document.title} | ${verdict(document.bars.effects.passed)} — mean ${decimal(effect?.mean)}, p99 ${decimal(effect?.p99)} / mean ≤ ${thresholds.effects.mean}, p99 ≤ ${thresholds.effects.p99} | ${verdict(document.bars.pressColor.passed)} — mean ${decimal(press?.mean)}, p99 ${decimal(press?.p99)} / mean ≤ ${thresholds.pressColor.mean}, p99 ≤ ${thresholds.pressColor.p99} | ${verdict(document.bars.size.passed)} — ${(document.bars.size.measured ?? 0).toLocaleString()} / ≤ ${thresholds.pdfBytes.toLocaleString()} bytes |`
  })
  const worstEffect = run.documents.reduce(
    (worst, document) => ({
      mean: Math.max(worst.mean, document.bars.effects.measured?.mean ?? 0),
      p99: Math.max(worst.p99, document.bars.effects.measured?.p99 ?? 0),
    }),
    { mean: 0, p99: 0 },
  )
  const worstPress = run.documents.reduce(
    (worst, document) => ({
      mean: Math.max(worst.mean, document.bars.pressColor.measured?.mean ?? 0),
      p99: Math.max(worst.p99, document.bars.pressColor.measured?.p99 ?? 0),
    }),
    { mean: 0, p99: 0 },
  )
  const largest = Math.max(...run.documents.map((document) => document.pdfBytes), 0)
  const all = {
    effects: run.documents.every((document) => document.bars.effects.passed),
    press: run.documents.every((document) => document.bars.pressColor.passed),
    size: run.documents.every((document) => document.bars.size.passed),
  }
  return [
    `| **Total** | **${verdict(all.effects)}** — mean ${decimal(worstEffect.mean)}, p99 ${decimal(worstEffect.p99)} / mean ≤ ${thresholds.effects.mean}, p99 ≤ ${thresholds.effects.p99} | **${verdict(all.press)}** — mean ${decimal(worstPress.mean)}, p99 ${decimal(worstPress.p99)} / mean ≤ ${thresholds.pressColor.mean}, p99 ≤ ${thresholds.pressColor.p99} | **${verdict(all.size)}** — ${largest.toLocaleString()} / ≤ ${thresholds.pdfBytes.toLocaleString()} bytes |`,
    ...documents,
  ]
}

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
  const imageThreshold = run.metadata.comparisonImageThreshold
  const markdown = `# Fidelity run: ${run.metadata.label}\n\n## Acceptance bars\n\nThe thresholds are provisional values set from the baseline.\n\n| Document | Effects | Press color | PDF size |\n|---|---|---|---|\n${barRows(run).join('\n')}\n\nCommit: \`${run.metadata.commit}\`. Screen references use device scale factor ${run.metadata.scale}. Side-by-sides are emitted when mean difference exceeds ${imageThreshold.mean} or p99 exceeds ${imageThreshold.p99}; the screen image is on the left.\n\n## Summary\n\n| Document | Reader | PDF bytes | Rendered | Mean | P99 |\n|---|---|---:|:---:|---:|---:|\n${rows.join('\n')}\n\n## Worst regions\n\n${worstLines.join('\n') || 'No region exceeded the reporting set.'}\n\n## Reader failures\n\n${failures.join('\n') || 'None.'}\n\n## Chromium 300 dpi rasters\n\n${rasters.join('\n') || 'None.'}\n`
  await Bun.write(path.join(directory, 'summary.md'), markdown)
}

export function regionKey(document: string, reader: string, region: RegionResult): string {
  return `${document}\u0000${reader}\u0000${region.name}`
}

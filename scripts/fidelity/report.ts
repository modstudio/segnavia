import path from 'node:path'
import { barCell, totalBars } from './bars.ts'
import { ACCEPTANCE_BARS, ALIGNMENT_SEARCH_RADIUS, ALIGNMENT_TOLERANCE, MARKER_MATCH_MAX_SCORE } from './config.ts'
import type { FidelityRun, RegionResult } from './types.ts'

const decimal = (value: number | undefined): string => (value === undefined ? '—' : value.toFixed(2))
const relative = (root: string, file: string): string => path.relative(root, file).split(path.sep).join('/')
function barRows(run: FidelityRun): string[] {
  const total = totalBars(run.documents)
  return [
    `| **Total** | ${ACCEPTANCE_BARS.map((bar) => `**${barCell(total[bar.id], bar.id, true)}**`).join(' | ')} |`,
    ...run.documents.map((document) => `| ${document.title} | ${ACCEPTANCE_BARS.map((bar) => barCell(document.bars[bar.id], bar.id)).join(' | ')} |`),
  ]
}

export async function writeSummary(run: FidelityRun, directory: string): Promise<void> {
  await Bun.write(path.join(directory, 'summary.json'), `${JSON.stringify(run, null, 2)}\n`)
  const readerNames = [...new Map(run.documents.flatMap((document) => document.readers.map((reader) => [reader.reader, reader.engine])))]
  const rows = run.documents.map((document) => {
    const cells = readerNames.map(([name]) => {
      const reader = document.readers.find((candidate) => candidate.reader === name)
      return reader?.worked ? `${decimal(reader.page?.mean)} / ${decimal(reader.page?.p99)}` : `SKIP — ${reader?.error ?? 'not run'}`
    })
    return `| ${document.title} | ${document.pdfBytes.toLocaleString()} | ${cells.join(' | ')} |`
  })
  const readerHeader = readerNames.map(([, engine]) => engine).join(' | ')
  const readerDivider = readerNames.map(() => '---:').join('|')
  const profiles = readerNames.map(([name, engine]) => {
    const results = run.documents.map((document) => document.readers.find((reader) => reader.reader === name)).filter((reader) => reader?.worked)
    const values = [...new Set(results.map((reader) => reader?.colorProfile ?? 'not checked'))]
    return `- ${engine}: ${values.join(', ') || 'not rendered'}`
  })
  const boxes = run.documents.map((document) => `- ${document.title}: screen ${document.comparisonBox.screen}; readers ${document.comparisonBox.readers}.`)
  const registration = run.documents.flatMap((document) =>
    document.readers.map((reader) => {
      const offset = reader.alignment
      return `| ${document.title} | ${reader.engine} | ${offset ? `${offset.offsetX}, ${offset.offsetY} device px; scores ${offset.referenceScore}/${offset.measuredScore}` : `SKIP — ${reader.error ?? 'not run'}`} |`
    }),
  )
  const worst = run.documents
    .flatMap((document) =>
      document.readers.flatMap((reader) =>
        (reader.regions ?? []).map((region) => ({ document: document.title, reader: reader.engine, region, score: region.mean + region.p99 / 255 })),
      ),
    )
    .sort((left, right) => right.score - left.score)
  const failures = run.documents.flatMap((document) =>
    document.readers.filter((reader) => !reader.worked).map((reader) => `- ${document.title} / ${reader.engine}: ${reader.error}`),
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
  const imageThreshold = ACCEPTANCE_BARS.find((bar) => bar.id === 'effects')?.threshold as { mean: number; p99: number }
  const posterEvidence = run.posterEvidence
  const posterLines = posterEvidence?.variants.flatMap((variant) =>
    variant.lines.map(
      (line) => `| ${variant.variant} | ${line.line} | ${line.displacementX} | ${line.displacementY} | ${line.widthChange} | ${line.heightChange} |`,
    ),
  )
  const posterCrops = posterEvidence?.variants.map(
    (variant) =>
      `- ${variant.variant}: [screen crop](${relative(directory, variant.screenCrop)}) | [Poppler crop](${relative(directory, variant.popplerCrop)}); marker offset ${variant.alignment.offsetX}, ${variant.alignment.offsetY} device px.`,
  )
  const barHeader = ACCEPTANCE_BARS.map((bar) => bar.title).join(' | ')
  const barDivider = ACCEPTANCE_BARS.map(() => '---').join('|')
  const markdown = `# Fidelity run: ${run.metadata.label}\n\n## Acceptance bars\n\nShmuel agreed these thresholds on 2026-10-14.\n\n| Document | ${barHeader} |\n|---|${barDivider}|\n${barRows(run).join('\n')}\n\nCommit: \`${run.metadata.commit}\`. Screen references use device scale factor ${run.metadata.scale}. Side-by-sides are emitted when mean difference exceeds ${imageThreshold.mean} or p99 exceeds ${imageThreshold.p99}; the screen image is on the left.\n\n## Summary\n\nReader cells are mean / p99 channel difference.\n\n| Document | PDF bytes | ${readerHeader} |\n|---|---:|${readerDivider}|\n${rows.join('\n')}\n\n## Compared page boxes\n\n${boxes.join('\n')}\n\n## Registration\n\nOffsets are found from the fixed marker within ±${ALIGNMENT_SEARCH_RADIUS} device pixels and are diagnostic only; they are never applied to the comparison. A reader fails when either axis exceeds ${ALIGNMENT_TOLERANCE} device pixels or either five-sample marker score exceeds ${MARKER_MATCH_MAX_SCORE}.\n\n| Document | Reader | Reader minus screen; marker scores reference/reader |\n|---|---|---:|\n${registration.join('\n')}\n\n## Poster headline layout evidence\n\n${posterEvidence?.method ?? 'Not measured.'}\n\nEach displacement is Poppler minus screen in device pixels. Width and height changes are Poppler minus screen glyph-box dimensions.\n\n| Scratch variant | Line | Horizontal displacement | Vertical displacement | Width change | Height change |\n|---|---:|---:|---:|---:|---:|\n${posterLines?.join('\n') ?? ''}\n\n${posterCrops?.join('\n') ?? ''}\n\n${posterEvidence?.conclusion ?? ''} The scratch variants are generated in memory; the committed fixture is unchanged.\n\n## Reader color profiles\n\n${profiles.join('\n')}\n\n## Worst regions\n\n${worstLines.join('\n') || 'No region exceeded the reporting set.'}\n\n## Reader failures\n\n${failures.join('\n') || 'None.'}\n\n## Chromium 300 dpi rasters\n\n${rasters.join('\n') || 'None.'}\n\n## Limits\n\nThe Harlequin RIP engine is not covered by this local suite.\n`
  await Bun.write(path.join(directory, 'summary.md'), markdown)
}

export function regionKey(document: string, reader: string, region: RegionResult): string {
  return `${document}\u0000${reader}\u0000${region.name}`
}

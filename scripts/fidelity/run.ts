import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { openRenderer } from '@segnavia/render'
import { chromiumPath, fixtures, OUTPUT_ROOT, ROOT, SCALE, THRESHOLD } from './config.ts'
import { difference, imageSize, sideBySide } from './image.ts'
import { analyzePdf, trimPdf } from './pdf.ts'
import { chromiumViewer, coreGraphics, poppler, readerPath } from './readers.ts'
import { writeSummary } from './report.ts'
import type { Box, DocumentResult, FidelityRun, ReaderResult, RegionResult } from './types.ts'

const label = (process.argv[2] ?? 'baseline').replace(/[^a-zA-Z0-9._-]+/g, '-')
const commit = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim()
const directory = path.join(OUTPUT_ROOT, `${label}-${commit}`)
if (existsSync(directory)) throw new Error(`The run directory already exists: ${directory}`)
mkdirSync(directory, { recursive: true })
const executablePath = chromiumPath()
const renderer = await openRenderer({ executablePath, concurrency: 1 })
const documents: DocumentResult[] = []

try {
  for (const fixture of await fixtures()) {
    console.log(`Rendering ${fixture.title}`)
    const documentDirectory = path.join(directory, fixture.id)
    const readerDirectory = path.join(documentDirectory, 'readers')
    const comparisonDirectory = path.join(documentDirectory, 'comparisons')
    mkdirSync(readerDirectory, { recursive: true })
    mkdirSync(comparisonDirectory, { recursive: true })
    const screen = path.join(documentDirectory, 'screen.png')
    const pdf = path.join(documentDirectory, `${fixture.id}.pdf`)
    const comparisonPdf = path.join(documentDirectory, 'comparison.pdf')
    const regions: Array<{ name: string; box: Box }> = []
    const screenBytes = await renderer.pageImage(fixture.page, {
      scale: SCALE,
      beforeOutput: async (tab) => {
        regions.push(
          ...(await tab.locator('[data-fidelity]').evaluateAll((elements) =>
            elements.map((element) => {
              const box = element.getBoundingClientRect()
              return { name: element.getAttribute('data-fidelity') ?? 'unnamed', box: { x: box.x, y: box.y, width: box.width, height: box.height } }
            }),
          )),
        )
      },
    })
    const pdfBytes = await renderer.pagePdf(fixture.page)
    await Bun.write(screen, screenBytes)
    await Bun.write(pdf, pdfBytes)
    await trimPdf(pdf, comparisonPdf)
    const size = await imageSize(screen)
    const readers: ReaderResult[] = await Promise.all([
      poppler(comparisonPdf, readerPath(readerDirectory, 'poppler'), size.width, size.height),
      coreGraphics(comparisonPdf, readerPath(readerDirectory, 'coregraphics'), size.width, size.height),
      chromiumViewer(executablePath, comparisonPdf, readerPath(readerDirectory, 'chromium'), size.width, size.height),
    ])
    for (const reader of readers) {
      if (!reader.worked || !reader.image) continue
      reader.page = difference(screen, reader.image, size.width, size.height)
      reader.regions = regions.map(({ name, box }) => {
        const scaled = { x: box.x * SCALE, y: box.y * SCALE, width: box.width * SCALE, height: box.height * SCALE }
        const result: RegionResult = { name, box: scaled, ...difference(screen, reader.image as string, size.width, size.height, scaled) }
        if (result.mean > THRESHOLD.mean || result.p99 > THRESHOLD.p99) {
          result.sideBySide = path.join(comparisonDirectory, `${reader.reader}-${name}.png`)
          sideBySide(screen, reader.image as string, scaled, result.sideBySide)
        }
        return result
      })
    }
    let pressPdf: string | undefined
    const profile = process.env.SEGNAVIA_FIDELITY_PROFILE
    if (fixture.press && profile) {
      pressPdf = path.join(documentDirectory, `${fixture.id}-press.pdf`)
      await Bun.write(pressPdf, await renderer.pagesPdf([fixture.page], { press: { profile: readFileSync(profile) } }))
    }
    documents.push({
      id: fixture.id,
      title: fixture.title,
      pdf,
      pdfBytes: pdfBytes.byteLength,
      screen,
      width: size.width,
      height: size.height,
      analysis: await analyzePdf(pdf),
      readers,
      pressPdf,
    })
    await Bun.write(path.join(directory, 'partial.json'), `${JSON.stringify(documents, null, 2)}\n`)
  }
} finally {
  await renderer.close()
}

const run: FidelityRun = {
  metadata: { label, commit, createdAt: new Date().toISOString(), scale: SCALE, threshold: THRESHOLD, chromium: executablePath },
  documents,
}
await writeSummary(run, directory)
console.log(`Fidelity report: ${path.join(directory, 'summary.md')}`)

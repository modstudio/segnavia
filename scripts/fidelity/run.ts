import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { type PageInput, Print, PX_PER_MM, printBoxes, printPadding, printProperties } from '@segnavia/format'
import { openRenderer } from '@segnavia/render'
import type { Page as Tab } from 'playwright-core'
import { measureBars } from './bars.ts'
import {
  ACCEPTANCE_BARS,
  chromiumPath,
  EFFECT_REGION_THRESHOLD,
  EFFECTLESS_CSS,
  EXPECTED_MARKER_POSITION,
  fixtures,
  MEASUREMENT_CSS,
  OUTPUT_ROOT,
  ROOT,
  SCALE,
} from './config.ts'
import { alignmentOffset, cropImage, difference, imageSize, proofImage, proofTable, sideBySide } from './image.ts'
import { analyzePdf, trimPdf } from './pdf.ts'
import { measurePosterLayout } from './poster-evidence.ts'
import { poppler, READERS, readerPath, validateReaderProfile } from './readers.ts'
import { writeSummary } from './report.ts'
import type { Box, Difference, DocumentResult, FidelityRun, PosterEvidence, ReaderResult, RegionResult } from './types.ts'

const label = (process.argv[2] ?? 'baseline').replace(/[^a-zA-Z0-9._-]+/g, '-')
const commit = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim()
const directory = path.join(OUTPUT_ROOT, `${label}-${commit}`)
if (existsSync(directory)) throw new Error(`The run directory already exists: ${directory}`)
mkdirSync(directory, { recursive: true })
const executablePath = chromiumPath()
const renderer = await openRenderer({ executablePath, concurrency: 1 })
const documents: DocumentResult[] = []
const profilePath = process.env.SEGNAVIA_FIDELITY_PROFILE
const profileBytes = profilePath ? new Uint8Array(readFileSync(profilePath)) : undefined
const table = profileBytes ? proofTable(profileBytes) : undefined
let posterEvidence: PosterEvidence | undefined

interface ScreenReference {
  page: PageInput
  css: string
  crop?: Box
  description: string
}

function screenReference(page: PageInput): ScreenReference {
  if (!page.print) return { page, css: MEASUREMENT_CSS, description: 'viewport matching the PDF TrimBox' }
  const print = Print.parse(page.print)
  const boxes = printBoxes(print)
  const margin = print.margin ?? { top: 0, right: 0, bottom: 0, left: 0 }
  const padding = printPadding({
    top: margin.top + print.bleed,
    right: margin.right + print.bleed,
    bottom: margin.bottom + print.bleed,
    left: margin.left + print.bleed,
  })
  const width = Math.round(boxes.bleedBox.width * PX_PER_MM)
  const height = Math.round(boxes.bleedBox.height * PX_PER_MM)
  const crop = {
    x: (boxes.trim.x - boxes.bleedBox.x) * PX_PER_MM * SCALE,
    y: (boxes.trim.y - boxes.bleedBox.y) * PX_PER_MM * SCALE,
    width: Math.round(boxes.trim.width * PX_PER_MM) * SCALE,
    height: Math.round(boxes.trim.height * PX_PER_MM) * SCALE,
  }
  return {
    page: { ...page, print: undefined, size: { width, height } },
    css: `${printProperties(print)}${padding}${MEASUREMENT_CSS}`,
    crop,
    description: `TrimBox crop of a ${boxes.bleedBox.width}×${boxes.bleedBox.height} mm BleedBox layout`,
  }
}

async function prepareEffectless(tab: Tab): Promise<void> {
  await tab.evaluate((effectlessCss) => {
    const firstColor = (paint: string): string | undefined => paint.match(/rgba?\([^)]*\)/)?.[0]
    const flattenBackground = (element: HTMLElement, pseudo?: '::before' | '::after'): void => {
      const paint = getComputedStyle(element, pseudo).backgroundImage
      if (!paint.includes('gradient(')) return
      element.classList.add(pseudo === '::before' ? 'fidelity-flat-before' : pseudo === '::after' ? 'fidelity-flat-after' : 'fidelity-flat-gradient')
      element.style.setProperty('--fidelity-flat-color', firstColor(paint) ?? 'transparent')
    }
    const gradientColor = (paint: string): string => {
      const id = paint.match(/url\(["']?#([^"')]+)["']?\)/)?.[1]
      const stop = id ? document.querySelector(`#${CSS.escape(id)} stop`) : undefined
      return stop ? getComputedStyle(stop).stopColor : '#000'
    }
    const flattenSvgPaint = (element: SVGElement, property: 'fill' | 'stroke', className: string): void => {
      const paint = getComputedStyle(element)[property]
      if (!paint.startsWith('url(')) return
      element.classList.add(className)
      element.style.setProperty(`--fidelity-flat-${property}`, gradientColor(paint))
    }
    for (const element of document.querySelectorAll<HTMLElement>('*')) {
      flattenBackground(element)
      flattenBackground(element, '::before')
      flattenBackground(element, '::after')
      if (element instanceof SVGElement) {
        flattenSvgPaint(element, 'fill', 'fidelity-flat-fill')
        flattenSvgPaint(element, 'stroke', 'fidelity-flat-stroke')
      }
    }
    const style = document.createElement('style')
    style.textContent = effectlessCss
    document.head.append(style)
  }, EFFECTLESS_CSS)
}

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
    const effectlessPdf = path.join(documentDirectory, `${fixture.id}-effectless.pdf`)
    const comparisonPdf = path.join(documentDirectory, 'comparison.pdf')
    const fullScreen = path.join(documentDirectory, 'screen-full.png')
    const regions: Array<{ name: string; box: Box }> = []
    const reference = screenReference(fixture.page)
    const screenBytes = await renderer.pageImage(reference.page, {
      scale: SCALE,
      css: reference.css,
      beforeOutput: async (tab) => {
        if (reference.crop) await tab.emulateMedia({ media: 'print' })
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
    const pdfBytes = await renderer.pagePdf(fixture.page, { css: MEASUREMENT_CSS })
    const effectlessPdfBytes = await renderer.pagePdf(fixture.page, {
      css: MEASUREMENT_CSS,
      beforeOutput: prepareEffectless,
    })
    if (reference.crop) {
      await Bun.write(fullScreen, screenBytes)
      cropImage(fullScreen, screen, reference.crop)
      for (const region of regions) {
        region.box.x -= reference.crop.x / SCALE
        region.box.y -= reference.crop.y / SCALE
      }
    } else await Bun.write(screen, screenBytes)
    await Bun.write(pdf, pdfBytes)
    await Bun.write(effectlessPdf, effectlessPdfBytes)
    await trimPdf(pdf, comparisonPdf)
    const size = await imageSize(screen)
    const readers: ReaderResult[] = await Promise.all(
      READERS.map((reader) => reader.render(comparisonPdf, readerPath(readerDirectory, reader.id), size.width, size.height, { executablePath })),
    )
    for (const reader of readers) validateReaderProfile(reader)
    for (const reader of readers) {
      if (!reader.worked || !reader.image) continue
      const croppedBleed = reference.crop?.x ?? 0
      const expectedMarker = Math.round(EXPECTED_MARKER_POSITION - croppedBleed)
      reader.alignment = alignmentOffset(screen, reader.image, size.width, size.height, expectedMarker, expectedMarker)
      if (!reader.alignment.passed) {
        reader.worked = false
        reader.error = reader.alignment.error
        continue
      }
      reader.page = difference(screen, reader.image, size.width, size.height)
      reader.regions = regions.map(({ name, box }) => {
        const x = Math.max(0, box.x * SCALE)
        const y = Math.max(0, box.y * SCALE)
        const scaled = {
          x,
          y,
          width: Math.max(0, Math.min(box.width * SCALE, size.width - x)),
          height: Math.max(0, Math.min(box.height * SCALE, size.height - y)),
        }
        const result: RegionResult = { name, box: scaled, ...difference(screen, reader.image as string, size.width, size.height, scaled) }
        if (result.mean > EFFECT_REGION_THRESHOLD.mean || result.p99 > EFFECT_REGION_THRESHOLD.p99) {
          result.sideBySide = path.join(comparisonDirectory, `${reader.reader}-${name}.png`)
          sideBySide(screen, reader.image as string, scaled, result.sideBySide)
        }
        return result
      })
    }
    let pressPdf: string | undefined
    let pressProof: string | undefined
    let pressRaster: string | undefined
    let pressDifference: Difference | undefined
    let pressReason: string | undefined
    if (profileBytes && table) {
      pressPdf = path.join(documentDirectory, `${fixture.id}-press.pdf`)
      const pressComparisonPdf = path.join(documentDirectory, 'press-comparison.pdf')
      pressProof = path.join(documentDirectory, 'screen-proof.png')
      pressRaster = path.join(documentDirectory, 'press.png')
      try {
        await Bun.write(
          pressPdf,
          await renderer.pagesPdf([fixture.page], {
            css: MEASUREMENT_CSS,
            press: { profile: profileBytes },
          }),
        )
        await trimPdf(pressPdf, pressComparisonPdf)
        proofImage(screen, pressProof, size.width, size.height, table)
        const rendered = await poppler(pressComparisonPdf, pressRaster, size.width, size.height)
        if (rendered.worked) pressDifference = difference(pressProof, pressRaster, size.width, size.height)
        else pressReason = rendered.error ?? 'Poppler did not render the press PDF.'
      } catch (error) {
        pressReason = error instanceof Error ? error.message : String(error)
        pressPdf = undefined
        pressProof = undefined
        pressRaster = undefined
      }
    } else {
      pressReason = 'SEGNAVIA_FIDELITY_PROFILE was not set.'
    }
    const regionResults = readers.flatMap((reader) => reader.regions ?? [])
    const worstRegion = regionResults.reduce((worst, region) => ({ mean: Math.max(worst.mean, region.mean), p99: Math.max(worst.p99, region.p99) }), {
      mean: 0,
      p99: 0,
    })
    const sizeMeasurement = {
      pdfBytes: pdfBytes.byteLength,
      effectlessPdfBytes: effectlessPdfBytes.byteLength,
      multiple: pdfBytes.byteLength / effectlessPdfBytes.byteLength,
    }
    documents.push({
      id: fixture.id,
      title: fixture.title,
      pdf,
      pdfBytes: pdfBytes.byteLength,
      effectlessPdf,
      effectlessPdfBytes: effectlessPdfBytes.byteLength,
      screen,
      width: size.width,
      height: size.height,
      comparisonBox: {
        screen: reference.description,
        readers: 'PDF TrimBox',
      },
      analysis: await analyzePdf(pdf),
      readers,
      pressPdf,
      pressProof,
      pressRaster,
      bars: measureBars({ readers, worstRegion, pressDifference, pressReason, size: sizeMeasurement }),
    })
    await Bun.write(path.join(directory, 'partial.json'), `${JSON.stringify(documents, null, 2)}\n`)
  }
  const poster = (await fixtures()).find((fixture) => fixture.id === 'poster')
  if (!poster) throw new Error('Poster fixture missing.')
  posterEvidence = await measurePosterLayout(renderer, directory, poster.page)
} finally {
  await renderer.close()
}

const run: FidelityRun = {
  metadata: {
    label,
    commit,
    createdAt: new Date().toISOString(),
    scale: SCALE,
    thresholds: Object.fromEntries(ACCEPTANCE_BARS.map((bar) => [bar.id, bar.threshold])) as FidelityRun['metadata']['thresholds'],
    chromium: executablePath,
    profile: profilePath,
  },
  documents,
  posterEvidence,
}
await writeSummary(run, directory)
console.log(`Fidelity report: ${path.join(directory, 'summary.md')}`)

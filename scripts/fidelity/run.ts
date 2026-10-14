import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { type PageInput, Print, PX_PER_MM, printBoxes, printPadding, printProperties } from '@segnavia/format'
import { openRenderer } from '@segnavia/render'
import type { Page as Tab } from 'playwright-core'
import {
  chromiumPath,
  EFFECT_REGION_THRESHOLD,
  EFFECTLESS_CSS,
  fixtures,
  MEASUREMENT_CSS,
  OUTPUT_ROOT,
  PDF_SIZE_THRESHOLD,
  PRESS_COLOR_THRESHOLD,
  ROOT,
  SCALE,
} from './config.ts'
import { alignmentOffset, cropImage, difference, glyphLineBoxes, imageSize, proofImage, proofTable, sideBySide } from './image.ts'
import { analyzePdf, trimPdf } from './pdf.ts'
import { adobePdfEngine, chromiumViewer, coreGraphics, ghostscript, poppler, readerPath, validateReaderProfile } from './readers.ts'
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

async function posterLayoutEvidence(poster: PageInput): Promise<PosterEvidence> {
  const evidenceDirectory = path.join(directory, 'poster', 'layout-evidence')
  mkdirSync(evidenceDirectory, { recursive: true })
  const diagnosticCss =
    '<style>body{background:#fff!important}.fade,.art,.ticket,.type p{visibility:hidden!important}.type h1{color:#000!important;text-shadow:none!important}</style>'
  const variants = [
    { id: 'authored', label: 'authored CSS', css: '' },
    { id: 'no-letter-spacing', label: 'letter-spacing removed', css: '<style>.type h1{letter-spacing:normal!important}</style>' },
    { id: 'normal-line-height', label: 'line-height normal', css: '<style>.type h1{line-height:normal!important}</style>' },
  ]
  const results: PosterEvidence['variants'] = []
  for (const variant of variants) {
    const page = { ...poster, html: `${poster.html}${diagnosticCss}${variant.css}` }
    let headline = { x: 0, y: 0, width: 0, height: 0 }
    const screen = path.join(evidenceDirectory, `${variant.id}-screen-page.png`)
    const pdf = path.join(evidenceDirectory, `${variant.id}.pdf`)
    const comparisonPdf = path.join(evidenceDirectory, `${variant.id}-comparison.pdf`)
    const popplerImage = path.join(evidenceDirectory, `${variant.id}-poppler-page.png`)
    await Bun.write(
      screen,
      await renderer.pageImage(page, {
        scale: SCALE,
        css: MEASUREMENT_CSS,
        beforeOutput: async (tab) => {
          headline = await tab.locator('.type h1').evaluate((element) => {
            const box = element.getBoundingClientRect()
            return { x: box.x, y: box.y, width: box.width, height: box.height }
          })
        },
      }),
    )
    await Bun.write(pdf, await renderer.pagePdf(page, { css: MEASUREMENT_CSS }))
    await trimPdf(pdf, comparisonPdf)
    const size = await imageSize(screen)
    const rendered = await poppler(comparisonPdf, popplerImage, size.width, size.height)
    if (!rendered.worked || !rendered.image) throw new Error(`Poster layout evidence did not render in Poppler: ${rendered.error ?? 'unknown error'}`)
    const alignment = alignmentOffset(screen, rendered.image, size.width, size.height, 16 * SCALE, 16 * SCALE)
    if (!alignment.passed) throw new Error(`Poster layout evidence is misaligned by ${alignment.offsetX}, ${alignment.offsetY} device px.`)
    const padding = 24 * SCALE
    const left = Math.max(0, headline.x * SCALE - padding)
    const top = Math.max(0, headline.y * SCALE - padding)
    const crop = {
      x: left,
      y: top,
      width: Math.min(size.width, (headline.x + headline.width) * SCALE + padding) - left,
      height: Math.min(size.height, (headline.y + headline.height) * SCALE + padding) - top,
    }
    const screenCrop = path.join(evidenceDirectory, `${variant.id}-screen-headline.png`)
    const popplerCrop = path.join(evidenceDirectory, `${variant.id}-poppler-headline.png`)
    cropImage(screen, screenCrop, crop)
    cropImage(rendered.image, popplerCrop, crop)
    const cropSize = await imageSize(screenCrop)
    const screenLines = glyphLineBoxes(screenCrop, cropSize.width, cropSize.height)
    const popplerLines = glyphLineBoxes(popplerCrop, cropSize.width, cropSize.height)
    if (screenLines.length !== 3 || popplerLines.length !== 3) {
      throw new Error(`${variant.id} poster evidence found ${screenLines.length} screen lines and ${popplerLines.length} Poppler lines; expected 3 each.`)
    }
    results.push({
      variant: variant.label,
      screenCrop,
      popplerCrop,
      alignment,
      lines: screenLines.map((screenBox, index) => {
        const popplerBox = popplerLines[index] as (typeof popplerLines)[number]
        return {
          line: index + 1,
          screen: screenBox,
          poppler: popplerBox,
          displacementX: popplerBox.x - screenBox.x,
          displacementY: popplerBox.y - screenBox.y,
          widthChange: popplerBox.width - screenBox.width,
          heightChange: popplerBox.height - screenBox.height,
        }
      }),
    })
  }
  const authored = results[0]?.lines ?? []
  const withoutSpacing = results[1]?.lines ?? []
  const normalLineHeight = results[2]?.lines ?? []
  const sameDisplacement = (left: typeof authored, right: typeof authored, axis: 'displacementX' | 'displacementY') =>
    left.every((line, index) => Math.abs(line[axis] - (right[index]?.[axis] ?? Number.POSITIVE_INFINITY)) <= 1)
  const spacingFinding = sameDisplacement(authored, withoutSpacing, 'displacementX')
    ? 'Removing letter-spacing preserves the horizontal displacement.'
    : 'Removing letter-spacing changes the horizontal displacement.'
  const lineHeightFinding = sameDisplacement(authored, normalLineHeight, 'displacementY')
    ? 'Normal line-height preserves the vertical displacement.'
    : 'Normal line-height changes the vertical displacement.'
  const authoredX = authored.map((line) => line.displacementX).join(', ')
  const authoredY = authored.map((line) => line.displacementY).join(', ')
  const marker = results[0]?.alignment
  return {
    method:
      'An in-memory copy isolates the black headline on white, removes its shadow, and keeps the fixed page marker. Screen and Poppler crops use identical page coordinates after marker registration; dark-pixel glyph bounds are measured for each line.',
    variants: results,
    conclusion: `The fixed marker is displaced ${marker?.offsetX ?? '—'}, ${marker?.offsetY ?? '—'} device px while the authored glyph boxes are displaced horizontally ${authoredX} and vertically ${authoredY} device px, so page crop or registration does not explain the headline difference. ${spacingFinding} ${lineHeightFinding} Neither scratch change removes the difference; the evidence supports Chromium screen-versus-print text metrics or layout as the cause, but does not isolate one authored property.`,
  }
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
    const readers: ReaderResult[] = await Promise.all([
      poppler(comparisonPdf, readerPath(readerDirectory, 'poppler'), size.width, size.height),
      coreGraphics(comparisonPdf, readerPath(readerDirectory, 'coregraphics'), size.width, size.height),
      chromiumViewer(executablePath, comparisonPdf, readerPath(readerDirectory, 'chromium'), size.width, size.height),
      adobePdfEngine(comparisonPdf, readerPath(readerDirectory, 'adobe'), size.width, size.height),
      ghostscript(comparisonPdf, readerPath(readerDirectory, 'ghostscript'), size.width, size.height),
    ])
    for (const reader of readers) validateReaderProfile(reader)
    for (const reader of readers) {
      if (!reader.worked || !reader.image) continue
      const croppedBleed = reference.crop?.x ?? 0
      const expectedMarker = Math.round(16 * SCALE - croppedBleed)
      reader.alignment = alignmentOffset(screen, reader.image, size.width, size.height, expectedMarker, expectedMarker)
      if (!reader.alignment.passed) {
        throw new Error(
          `${fixture.id}/${reader.reader} is misaligned by ${reader.alignment.offsetX}px horizontally and ${reader.alignment.offsetY}px vertically.`,
        )
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
    const readersWorked = readers.every((reader) => reader.worked)
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
      bars: {
        effects: {
          measured: worstRegion,
          passed: readersWorked && worstRegion.mean <= EFFECT_REGION_THRESHOLD.mean && worstRegion.p99 <= EFFECT_REGION_THRESHOLD.p99,
          reason: readersWorked ? undefined : 'At least one PDF reader did not render the document.',
        },
        pressColor: {
          measured: pressDifference,
          passed: Boolean(pressDifference && pressDifference.mean <= PRESS_COLOR_THRESHOLD.mean && pressDifference.p99 <= PRESS_COLOR_THRESHOLD.p99),
          reason: pressReason,
        },
        size: {
          measured: sizeMeasurement,
          passed: sizeMeasurement.multiple <= PDF_SIZE_THRESHOLD.multiple && pdfBytes.byteLength <= PDF_SIZE_THRESHOLD.absoluteBytes,
        },
      },
    })
    await Bun.write(path.join(directory, 'partial.json'), `${JSON.stringify(documents, null, 2)}\n`)
  }
  const poster = (await fixtures()).find((fixture) => fixture.id === 'poster')
  if (!poster) throw new Error('Poster fixture missing.')
  posterEvidence = await posterLayoutEvidence(poster.page)
} finally {
  await renderer.close()
}

const run: FidelityRun = {
  metadata: {
    label,
    commit,
    createdAt: new Date().toISOString(),
    scale: SCALE,
    thresholds: { effects: EFFECT_REGION_THRESHOLD, pressColor: PRESS_COLOR_THRESHOLD, size: PDF_SIZE_THRESHOLD },
    chromium: executablePath,
    profile: profilePath,
  },
  documents,
  posterEvidence,
}
await writeSummary(run, directory)
console.log(`Fidelity report: ${path.join(directory, 'summary.md')}`)

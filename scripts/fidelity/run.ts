import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { type PageInput, Print, printBoxes } from '@segnavia/format'
import { openRenderer } from '@segnavia/render'
import type { Page as Tab } from 'playwright-core'
import { readProfile } from '../../packages/render/src/color/index.ts'
import { printCss } from '../../packages/render/src/page-paper.ts'
import { renderBookFixtures } from './book-run.ts'
import { booksFail } from './book-verdict.ts'
import { ACCEPTANCE_BARS, chromiumPath, EXPECTED_MARKER_POSITION, fixtures, MEASUREMENT_CSS, OUTPUT_ROOT, ROOT, SCALE } from './config.ts'
import { bleedViewport, trimRasterBox } from './geometry.ts'
import { cropImage, proofTable } from './image.ts'
import { type FidelitySession, finishDocument, prepareEffectless } from './measure-document.ts'
import { trimPdf } from './pdf.ts'
import { measurePosterLayout } from './poster-evidence.ts'
import { pressDisplayProfile, pressGhostscriptSettings, pressRasterizer, pressRasterizerEngine } from './readers.ts'
import { type ComputedStyleFacts, computedStyleFacts, fidelityRegions, offsetBoxes } from './regions.ts'
import { writeSummary } from './report.ts'
import type { Box, DocumentResult, FidelityRun, PosterEvidence } from './types.ts'

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
const profile = profileBytes ? readProfile(profileBytes) : undefined
const table = profileBytes ? proofTable(profileBytes) : undefined
const defaultGrayProfile = '/System/Library/ColorSync/Profiles/Generic Gray Gamma 2.2 Profile.icc'
const grayProfilePath = process.env.SEGNAVIA_FIDELITY_GRAY_PROFILE ?? (existsSync(defaultGrayProfile) ? defaultGrayProfile : undefined)
const grayProfileBytes = grayProfilePath ? new Uint8Array(readFileSync(grayProfilePath)) : undefined
const grayTable = grayProfileBytes ? proofTable(grayProfileBytes) : undefined
const selectedPressRasterizer = pressRasterizer()
const session: FidelitySession = {
  renderer,
  executablePath,
  profilePath,
  profileBytes,
  profile,
  table,
  grayProfilePath,
  grayProfileBytes,
  grayTable,
  selectedPressRasterizer,
  defaultGrayProfile,
}
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
  const { width, height } = bleedViewport(boxes.bleedBox)
  const crop = trimRasterBox(boxes.bleedBox, boxes.trim, SCALE)
  return {
    page: { ...page, print: undefined, size: { width, height } },
    css: `${printCss(print)}${MEASUREMENT_CSS}`,
    crop,
    description: `TrimBox crop of a ${boxes.bleedBox.width}×${boxes.bleedBox.height} mm BleedBox layout`,
  }
}

try {
  for (const fixture of await fixtures()) {
    console.log(`Rendering ${fixture.title}`)
    const documentDirectory = path.join(directory, fixture.id)
    mkdirSync(path.join(documentDirectory, 'readers'), { recursive: true })
    mkdirSync(path.join(documentDirectory, 'comparisons'), { recursive: true })
    const screen = path.join(documentDirectory, 'screen.png')
    const pdf = path.join(documentDirectory, `${fixture.id}.pdf`)
    const effectlessPdf = path.join(documentDirectory, `${fixture.id}-effectless.pdf`)
    const comparisonPdf = path.join(documentDirectory, 'comparison.pdf')
    const fullScreen = path.join(documentDirectory, 'screen-full.png')
    const regions: Array<{ name: string; box: Box }> = []
    let blendedFacts: ComputedStyleFacts[] = []
    const reference = screenReference(fixture.page)
    const screenBytes = await renderer.pageImage(reference.page, {
      scale: SCALE,
      css: reference.css,
      beforeOutput: async (tab: Tab) => {
        if (reference.crop) await tab.emulateMedia({ media: 'print' })
        const root = tab.locator('html')
        regions.push(...(await fidelityRegions(root)))
        blendedFacts = await computedStyleFacts(root)
      },
    })
    let rasterEffects = 0
    const pdfBytes = await renderer.pagePdf(fixture.page, {
      css: MEASUREMENT_CSS,
      effects: { report: (report) => (rasterEffects = report.raster ?? 0) },
    })
    const effectlessPdfBytes = await renderer.pagePdf(fixture.page, {
      css: MEASUREMENT_CSS,
      beforeOutput: prepareEffectless,
    })
    if (reference.crop) {
      await Bun.write(fullScreen, screenBytes)
      cropImage(fullScreen, screen, reference.crop)
      offsetBoxes(regions, reference.crop.x / SCALE, reference.crop.y / SCALE)
      offsetBoxes(blendedFacts, reference.crop.x / SCALE, reference.crop.y / SCALE)
    } else await Bun.write(screen, screenBytes)
    await Bun.write(pdf, pdfBytes)
    await Bun.write(effectlessPdf, effectlessPdfBytes)
    await trimPdf(pdf, comparisonPdf)
    documents.push(
      await finishDocument({
        id: fixture.id,
        title: fixture.title,
        kind: fixture.kind,
        directory: documentDirectory,
        screen,
        pdf,
        pdfBytes: pdfBytes.byteLength,
        effectlessPdf,
        effectlessPdfBytes: effectlessPdfBytes.byteLength,
        comparisonPdf,
        comparisonBox: {
          screen: reference.description,
          readers: 'PDF TrimBox',
        },
        regions,
        blendedFacts,
        rasterEffects,
        expectedMarker: Math.round(EXPECTED_MARKER_POSITION - (reference.crop?.x ?? 0)),
        size: {
          pdfBytes: pdfBytes.byteLength,
          effectlessPdfBytes: effectlessPdfBytes.byteLength,
          multiple: pdfBytes.byteLength / effectlessPdfBytes.byteLength,
          rasterEffects,
        },
        session,
        page: fixture.page,
      }),
    )
    await Bun.write(path.join(directory, 'partial.json'), `${JSON.stringify(documents, null, 2)}\n`)
  }
  documents.push(...(await renderBookFixtures(session, directory)))
  await Bun.write(path.join(directory, 'partial.json'), `${JSON.stringify(documents, null, 2)}\n`)
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
    grayProfile: grayProfilePath,
    pressRasterizer: {
      mode: selectedPressRasterizer,
      engine: pressRasterizerEngine(selectedPressRasterizer),
      grayMode: 'profiled-poppler',
      grayEngine: pressRasterizerEngine('profiled-poppler'),
      cmykSettings:
        selectedPressRasterizer === 'ghostscript'
          ? pressGhostscriptSettings(profilePath ?? 'not set', 'cmyk')
          : [`-defaultcmykprofile ${profilePath ?? 'not set'}`, `-displayprofile ${pressDisplayProfile}`],
      graySettings: [`-defaultgrayprofile ${grayProfilePath ?? 'not set'}`, `-displayprofile ${pressDisplayProfile}`],
      outputIntent:
        selectedPressRasterizer === 'ghostscript'
          ? 'Each CMYK press PDF embeds the run profile as its first output intent. Ghostscript uses that profile as the destination when its color space matches the output device; no separate output profile is supplied. Gray press PDFs contain no RGB, so the gray pass remains on profiled Poppler.'
          : 'Poppler does not use the PDF output intent for this fallback measurement.',
      displayProfile: selectedPressRasterizer === 'profiled-poppler' ? pressDisplayProfile : undefined,
      cmykProfile: profilePath,
      grayProfile: grayProfilePath,
    },
  },
  documents,
  posterEvidence,
}
await writeSummary(run, directory)
console.log(`Fidelity report: ${path.join(directory, 'summary.md')}`)
if (booksFail(documents)) process.exitCode = 1

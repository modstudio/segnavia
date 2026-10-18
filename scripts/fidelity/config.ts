import { existsSync } from 'node:fs'
import path from 'node:path'
import type { PageInput } from '@segnavia/format'
import type { BarId, Difference, ReaderResult, SizeMeasurement, Threshold } from './types.ts'

export const ROOT = path.resolve(import.meta.dir, '../..')
export const OUTPUT_ROOT = path.resolve(process.env.SEGNAVIA_FIDELITY_OUT ?? path.join(ROOT, 'out/fidelity'))
export const SCALE = 4
export const CSS_PX_PER_INCH = 96
export const READER_RASTER_DPI = CSS_PX_PER_INCH * SCALE
// Shmuel agreed these acceptance limits on 2026-10-14.
export const EFFECT_REGION_THRESHOLD = { mean: 2, p99: 24 }
export const PRESS_COLOR_THRESHOLD = { mean: 3, p99: 30 }
// Provisional: the final value will be set from the split-region measurements.
export const PRESS_BLEND_THRESHOLD = { mean: 6, p99: 60 }
export const PDF_SIZE_THRESHOLD = { multiple: 3, absoluteBytes: 500_000 }
export const ALIGNMENT_SEARCH_RADIUS = 16
export const ALIGNMENT_TOLERANCE = 8
export const MARKER_INSET = 16
export const MARKER_SIZE = 12
export const MARKER_BORDER = 3
export const MARKER_FILL = [1, 254, 2] as const
export const MARKER_BORDER_COLOR = [254, 1, 253] as const
// A full five-reader run measured scores of 0 for Poppler, 1 for CoreGraphics, 0–17 for Chromium, 0 for Adobe, and 0 for Ghostscript.
export const MARKER_MATCH_MAX_SCORE = 50
export const EXPECTED_MARKER_POSITION = MARKER_INSET * SCALE

const color = (value: readonly number[]) => `rgb(${value.join(' ')})`
export const MEASUREMENT_CSS = `html{overflow:clip!important}html::after{content:"";position:fixed;left:${MARKER_INSET}px;top:${MARKER_INSET}px;width:${MARKER_SIZE}px;height:${MARKER_SIZE}px;box-sizing:border-box;background:${color(MARKER_FILL)};border:${MARKER_BORDER}px solid ${color(MARKER_BORDER_COLOR)};z-index:2147483647;pointer-events:none}`

export interface BarFacts {
  readers: ReaderResult[]
  worstRegion: Difference
  pressFlatDifference?: Difference
  pressBlendedDifference?: Difference
  pressReason?: string
  grayPressFlatDifference?: Difference
  grayPressBlendedDifference?: Difference
  grayPressResidues?: number
  grayPressResidueErrors?: string[]
  grayPressReason?: string
  size: SizeMeasurement
}

export interface AcceptanceBar {
  id: BarId
  title: string
  threshold: Threshold | { multiple: number; absoluteBytes: number }
  measure: (facts: BarFacts) => Difference | SizeMeasurement | undefined
  pass: (measured: Difference | SizeMeasurement | undefined, facts: BarFacts) => boolean
  reason: (measured: Difference | SizeMeasurement | undefined, facts: BarFacts) => string | undefined
  format: (measured: Difference | SizeMeasurement | undefined, total: boolean) => string
}

const decimal = (value: number | undefined): string => (value === undefined ? '—' : value.toFixed(2))
const differenceFormat = (threshold: Threshold) => (measured: Difference | SizeMeasurement | undefined) => {
  const value = measured as Difference | undefined
  return `mean ${decimal(value?.mean)}, p99 ${decimal(value?.p99)} / mean ≤ ${threshold.mean}, p99 ≤ ${threshold.p99}`
}

export const ACCEPTANCE_BARS: readonly AcceptanceBar[] = [
  {
    id: 'effects',
    title: 'Effects',
    threshold: EFFECT_REGION_THRESHOLD,
    measure: ({ worstRegion }) => worstRegion,
    pass: (measured, { readers }) => {
      const value = measured as Difference
      return readers.every((reader) => reader.worked) && value.mean <= EFFECT_REGION_THRESHOLD.mean && value.p99 <= EFFECT_REGION_THRESHOLD.p99
    },
    reason: (_, { readers }) => {
      const failed = readers.filter((reader) => !reader.worked)
      return failed.length ? failed.map((reader) => `${reader.engine} skipped: ${reader.error ?? 'unknown failure'}`).join('; ') : undefined
    },
    format: differenceFormat(EFFECT_REGION_THRESHOLD),
  },
  {
    id: 'pressColorFlat',
    title: 'CMYK press flat',
    threshold: PRESS_COLOR_THRESHOLD,
    measure: ({ pressFlatDifference }) => pressFlatDifference,
    pass: (measured) => {
      const value = measured as Difference | undefined
      return Boolean(value && value.mean <= PRESS_COLOR_THRESHOLD.mean && value.p99 <= PRESS_COLOR_THRESHOLD.p99)
    },
    reason: (measured, { pressReason }) => (measured ? undefined : (pressReason ?? 'The press measurement is missing.')),
    format: differenceFormat(PRESS_COLOR_THRESHOLD),
  },
  {
    id: 'pressColorBlended',
    title: 'CMYK press blended',
    threshold: PRESS_BLEND_THRESHOLD,
    measure: ({ pressBlendedDifference }) => pressBlendedDifference,
    pass: (measured) => {
      const value = measured as Difference | undefined
      return Boolean(value && value.mean <= PRESS_BLEND_THRESHOLD.mean && value.p99 <= PRESS_BLEND_THRESHOLD.p99)
    },
    reason: (measured, { pressReason }) => (measured ? undefined : (pressReason ?? 'The press measurement is missing.')),
    format: differenceFormat(PRESS_BLEND_THRESHOLD),
  },
  {
    id: 'grayPressColorFlat',
    title: 'Gray press flat',
    threshold: PRESS_COLOR_THRESHOLD,
    measure: ({ grayPressFlatDifference }) => grayPressFlatDifference,
    pass: (measured, { grayPressResidues, grayPressResidueErrors }) => {
      const value = measured as Difference | undefined
      return Boolean(
        value &&
          value.mean <= PRESS_COLOR_THRESHOLD.mean &&
          value.p99 <= PRESS_COLOR_THRESHOLD.p99 &&
          grayPressResidues === 0 &&
          grayPressResidueErrors?.length === 0,
      )
    },
    reason: (measured, { grayPressReason, grayPressResidues, grayPressResidueErrors }) => {
      if (!measured) return grayPressReason ?? 'The gray press measurement is missing.'
      if (grayPressResidueErrors?.length) return `Gray residue scan errors: ${grayPressResidueErrors.join('; ')}`
      if (grayPressResidues) return `${grayPressResidues} RGB or CMYK residues remain.`
      return undefined
    },
    format: differenceFormat(PRESS_COLOR_THRESHOLD),
  },
  {
    id: 'grayPressColorBlended',
    title: 'Gray press blended',
    threshold: PRESS_BLEND_THRESHOLD,
    measure: ({ grayPressBlendedDifference }) => grayPressBlendedDifference,
    pass: (measured) => {
      const value = measured as Difference | undefined
      return Boolean(value && value.mean <= PRESS_BLEND_THRESHOLD.mean && value.p99 <= PRESS_BLEND_THRESHOLD.p99)
    },
    reason: (measured, { grayPressReason }) => (measured ? undefined : (grayPressReason ?? 'The gray press measurement is missing.')),
    format: differenceFormat(PRESS_BLEND_THRESHOLD),
  },
  {
    id: 'size',
    title: 'PDF size (actual / effectless)',
    threshold: PDF_SIZE_THRESHOLD,
    measure: ({ size }) => size,
    pass: (measured) => {
      const value = measured as SizeMeasurement
      return value.multiple <= PDF_SIZE_THRESHOLD.multiple && value.pdfBytes <= PDF_SIZE_THRESHOLD.absoluteBytes
    },
    reason: () => undefined,
    format: (measured, total) => {
      const value = measured as SizeMeasurement | undefined
      const amount = total
        ? `largest ${value?.pdfBytes.toLocaleString() ?? '—'} bytes, worst ${decimal(value?.multiple)}×`
        : `${value?.pdfBytes.toLocaleString() ?? '—'} / ${value?.effectlessPdfBytes.toLocaleString() ?? '—'} = ${decimal(value?.multiple)}×`
      return `${amount} / ≤ ${PDF_SIZE_THRESHOLD.multiple}× and ≤ ${PDF_SIZE_THRESHOLD.absoluteBytes.toLocaleString()} bytes`
    },
  },
]

export const EFFECTLESS_CSS =
  '*,*::before,*::after{box-shadow:none!important;text-shadow:none!important;filter:none!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;mask-image:none!important;-webkit-mask-image:none!important}.fidelity-flat-gradient{background-image:none!important;background-color:var(--fidelity-flat-color)!important}.fidelity-flat-before::before,.fidelity-flat-after::after{background-image:none!important;background-color:var(--fidelity-flat-color)!important}.fidelity-flat-fill{fill:var(--fidelity-flat-fill)!important}.fidelity-flat-stroke{stroke:var(--fidelity-flat-stroke)!important}'

export interface Fixture {
  id: string
  title: string
  page: PageInput
}

const fixed = (id: string, title: string, width: number, height: number, extra: Partial<PageInput> = {}): Fixture => ({
  id,
  title,
  page: { html: '', size: { width, height }, ...extra },
})

export async function fixtures(): Promise<Fixture[]> {
  const entries = [
    fixed('flyer', 'Editorial flyer', 900, 1200),
    fixed('cards', 'Card collection', 1000, 800),
    fixed('glass-ui', 'Glass interface', 1100, 800),
    fixed('data-report', 'Data report', 1000, 750),
    fixed('poster', 'Event poster', 800, 1120),
    fixed('slide', 'Presentation slide', 1280, 720),
    fixed('print-piece', 'A5 postcard', 559, 794, {
      print: { paper: 'a5', orientation: 'portrait', bleed: 3, safe: 8, marks: false },
    }),
    fixed('hebrew', 'Hebrew editorial page', 900, 1100, { lang: 'he' }),
  ]
  for (const entry of entries) entry.page.html = await Bun.file(path.join(ROOT, 'fixtures/fidelity', `${entry.id}.html`)).text()
  return entries
}

export function chromiumPath(): string {
  const candidates = [
    process.env.SEGNAVIA_CHROMIUM,
    '/Users/shmuel/Library/Caches/ms-playwright/chromium-1194/chrome-mac/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  ]
  const found = candidates.find((candidate) => candidate && existsSync(candidate))
  if (!found) throw new Error('No Chromium executable was found. Set SEGNAVIA_CHROMIUM.')
  return found
}

import { existsSync } from 'node:fs'
import path from 'node:path'
import type { PageInput } from '@segnavia/format'
import { EFFECT_REGION_THRESHOLD, SCALE } from '../verify/pixel-difference.ts'
import type { BarId, Difference, FixtureKind, ReaderResult, SizeMeasurement, Threshold } from './types.ts'

export { EFFECT_REGION_THRESHOLD, READER_RASTER_DPI, SCALE } from '../verify/pixel-difference.ts'

export const ROOT = path.resolve(import.meta.dir, '../..')
export const OUTPUT_ROOT = path.resolve(process.env.SEGNAVIA_FIDELITY_OUT ?? path.join(ROOT, 'out/fidelity'))
export const CSS_PX_PER_INCH = 96
export const PRESS_COLOR_THRESHOLD = { mean: 3, p99: 30 }
// This regression ceiling sits just above the worst measured effects document.
export const PRESS_BLEND_THRESHOLD = { mean: 10, p99: 90 }
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
  kind: FixtureKind
  blendedFraction: number
  readers: ReaderResult[]
  worstRegion: Difference
  pressDifference?: Difference
  pressReason?: string
  grayPressDifference?: Difference
  grayPressResidues?: number
  grayPressResidueErrors?: string[]
  grayPressReason?: string
  size: SizeMeasurement
  rasterEffects?: number
}

export interface AcceptanceBar {
  id: BarId
  title: string
  threshold: Threshold | { multiple: number; absoluteBytes: number }
  thresholdFor?: (facts: BarFacts) => Threshold | { multiple: number; absoluteBytes: number }
  measure: (facts: BarFacts) => Difference | SizeMeasurement | undefined
  pass: (measured: Difference | SizeMeasurement | undefined, facts: BarFacts) => boolean
  reason: (measured: Difference | SizeMeasurement | undefined, facts: BarFacts) => string | undefined
  format: (measured: Difference | SizeMeasurement | undefined, threshold: Threshold | { multiple: number; absoluteBytes: number }, total: boolean) => string
}

const decimal = (value: number | undefined): string => (value === undefined ? '—' : value.toFixed(2))
const differenceFormat = (measured: Difference | SizeMeasurement | undefined, threshold: Threshold | { multiple: number; absoluteBytes: number }) => {
  const value = measured as Difference | undefined
  if (!('mean' in threshold)) throw new Error('A difference bar requires a mean/p99 threshold.')
  return `mean ${decimal(value?.mean)}, p99 ${decimal(value?.p99)} / mean ≤ ${threshold.mean}, p99 ≤ ${threshold.p99}`
}

export function pressThreshold(kind: FixtureKind): Threshold {
  return kind === 'control' ? PRESS_COLOR_THRESHOLD : PRESS_BLEND_THRESHOLD
}

export function judgePress(kind: FixtureKind, difference: Difference): boolean {
  const threshold = pressThreshold(kind)
  return difference.mean <= threshold.mean && difference.p99 <= threshold.p99
}

function controlMaskReason({ kind, blendedFraction }: BarFacts): string | undefined {
  return kind === 'control' && blendedFraction > 0.01
    ? `The control's blended mask covers ${(blendedFraction * 100).toFixed(2)}% of the page; controls allow at most 1%.`
    : undefined
}

export const ACCEPTANCE_BARS: readonly AcceptanceBar[] = [
  {
    id: 'effects',
    title: 'Effects',
    threshold: EFFECT_REGION_THRESHOLD,
    measure: ({ worstRegion }) => worstRegion,
    pass: (measured, { kind, readers }) => {
      if (kind === 'control') return true
      const value = measured as Difference
      return readers.every((reader) => reader.worked) && value.mean <= EFFECT_REGION_THRESHOLD.mean && value.p99 <= EFFECT_REGION_THRESHOLD.p99
    },
    reason: (_, { kind, readers }) => {
      if (kind === 'control') return 'Not applicable to control documents.'
      const failed = readers.filter((reader) => !reader.worked)
      return failed.length ? failed.map((reader) => `${reader.engine} skipped: ${reader.error ?? 'unknown failure'}`).join('; ') : undefined
    },
    format: differenceFormat,
  },
  {
    id: 'pressColor',
    title: 'CMYK press',
    threshold: PRESS_BLEND_THRESHOLD,
    thresholdFor: ({ kind }) => pressThreshold(kind),
    measure: ({ pressDifference }) => pressDifference,
    pass: (measured, facts) => {
      const value = measured as Difference | undefined
      return Boolean(value && judgePress(facts.kind, value) && controlMaskReason(facts) === undefined)
    },
    reason: (measured, facts) => controlMaskReason(facts) ?? (measured ? undefined : (facts.pressReason ?? 'The press measurement is missing.')),
    format: differenceFormat,
  },
  {
    id: 'grayPressColor',
    title: 'Gray press',
    threshold: PRESS_BLEND_THRESHOLD,
    thresholdFor: ({ kind }) => pressThreshold(kind),
    measure: ({ grayPressDifference }) => grayPressDifference,
    pass: (measured, facts) => {
      const value = measured as Difference | undefined
      return Boolean(
        value &&
          judgePress(facts.kind, value) &&
          facts.grayPressResidues === 0 &&
          facts.grayPressResidueErrors?.length === 0 &&
          controlMaskReason(facts) === undefined,
      )
    },
    reason: (measured, facts) => {
      const maskReason = controlMaskReason(facts)
      if (maskReason) return maskReason
      if (!measured) return facts.grayPressReason ?? 'The gray press measurement is missing.'
      if (facts.grayPressResidueErrors?.length) return `Gray residue scan errors: ${facts.grayPressResidueErrors.join('; ')}`
      if (facts.grayPressResidues) return `${facts.grayPressResidues} RGB or CMYK residues remain.`
      return undefined
    },
    format: differenceFormat,
  },
  {
    id: 'size',
    title: 'PDF size (actual / effectless)',
    threshold: PDF_SIZE_THRESHOLD,
    measure: ({ size }) => size,
    pass: (measured) => {
      const value = measured as SizeMeasurement
      return (Boolean(value.rasterEffects) || value.multiple <= PDF_SIZE_THRESHOLD.multiple) && value.pdfBytes <= PDF_SIZE_THRESHOLD.absoluteBytes
    },
    reason: (measured) =>
      (measured as SizeMeasurement).rasterEffects
        ? `The 3× bar is exempt because ${String((measured as SizeMeasurement).rasterEffects)} backdrop-filter region(s) use captured rasters; the 500,000-byte cap still applies.`
        : undefined,
    format: (measured, threshold, total) => {
      const value = measured as SizeMeasurement | undefined
      if (!('multiple' in threshold)) throw new Error('A size bar requires a multiple/bytes threshold.')
      const amount = total
        ? `largest ${value?.pdfBytes.toLocaleString() ?? '—'} bytes, worst ${decimal(value?.multiple)}×`
        : `${value?.pdfBytes.toLocaleString() ?? '—'} / ${value?.effectlessPdfBytes.toLocaleString() ?? '—'} = ${decimal(value?.multiple)}×`
      return (value?.rasterEffects ?? 0) > 0
        ? `${amount} / 3× exempt; ≤ ${threshold.absoluteBytes.toLocaleString()} bytes`
        : `${amount} / ≤ ${threshold.multiple}× and ≤ ${threshold.absoluteBytes.toLocaleString()} bytes`
    },
  },
]

export const EFFECTLESS_CSS =
  '*,*::before,*::after{box-shadow:none!important;text-shadow:none!important;filter:none!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;mask-image:none!important;-webkit-mask-image:none!important}.fidelity-flat-gradient{background-image:none!important;background-color:var(--fidelity-flat-color)!important}.fidelity-flat-before::before,.fidelity-flat-after::after{background-image:none!important;background-color:var(--fidelity-flat-color)!important}.fidelity-flat-fill{fill:var(--fidelity-flat-fill)!important}.fidelity-flat-stroke{stroke:var(--fidelity-flat-stroke)!important}'

export interface Fixture {
  id: string
  title: string
  kind: FixtureKind
  page: PageInput
}

const fixed = (id: string, title: string, width: number, height: number, kind: FixtureKind, extra: Partial<PageInput> = {}): Fixture => ({
  id,
  title,
  kind,
  page: { html: '', size: { width, height }, ...extra },
})

export async function fixtures(): Promise<Fixture[]> {
  const entries = [
    fixed('flyer', 'Editorial flyer', 900, 1200, 'effects'),
    fixed('cards', 'Card collection', 1000, 800, 'effects'),
    fixed('glass-ui', 'Glass interface', 1100, 800, 'effects'),
    fixed('data-report', 'Data report', 1000, 750, 'effects'),
    fixed('poster', 'Event poster', 800, 1120, 'effects'),
    fixed('slide', 'Presentation slide', 1280, 720, 'effects'),
    fixed('print-piece', 'A5 postcard', 559, 794, 'effects', {
      print: { paper: 'a5', orientation: 'portrait', bleed: 3, safe: 8, marks: false },
    }),
    fixed('hebrew', 'Hebrew editorial page', 900, 1100, 'effects', { lang: 'he' }),
    fixed('control-flat', 'Flat color control', 1000, 800, 'control'),
    fixed('control-text', 'Text control', 900, 1100, 'control'),
    fixed('control-photo', 'Photo control', 1000, 800, 'control'),
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

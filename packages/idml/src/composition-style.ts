import {
  COMPOSER_CUSTOM_PROPERTY,
  COMPOSER_VALUES,
  HYPHENATE_CUSTOM_PROPERTY,
  parseWordSpacing,
  serializeWordSpacing,
  WORD_SPACING_CUSTOM_PROPERTY,
} from '@segnavia/format'
import type { ReportCollector } from './report.ts'
import { INDESIGN_PROPERTY_DEFAULTS } from './style-property-report.ts'

const [PARAGRAPH_COMPOSER, SINGLE_LINE_COMPOSER] = COMPOSER_VALUES
const COMPOSERS: Readonly<Record<string, (typeof COMPOSER_VALUES)[number]>> = {
  '$ID/HL Composer Optyca': PARAGRAPH_COMPOSER,
  'HL Composer Optyca': PARAGRAPH_COMPOSER,
  '$ID/Adobe Paragraph Composer': PARAGRAPH_COMPOSER,
  'Adobe Paragraph Composer': PARAGRAPH_COMPOSER,
  '$ID/Adobe World-Ready Paragraph Composer': PARAGRAPH_COMPOSER,
  'Adobe World-Ready Paragraph Composer': PARAGRAPH_COMPOSER,
  '$ID/HL Single Optyca': SINGLE_LINE_COMPOSER,
  'HL Single Optyca': SINGLE_LINE_COMPOSER,
  '$ID/Adobe Single-line Composer': SINGLE_LINE_COMPOSER,
  'Adobe Single-line Composer': SINGLE_LINE_COMPOSER,
  '$ID/Adobe World-Ready Single-line Composer': SINGLE_LINE_COMPOSER,
  'Adobe World-Ready Single-line Composer': SINGLE_LINE_COMPOSER,
}

const WORD_SPACING_PROPERTIES = ['MinimumWordSpacing', 'DesiredWordSpacing', 'MaximumWordSpacing'] as const

function defaultValue(name: (typeof WORD_SPACING_PROPERTIES)[number]): string {
  return String(INDESIGN_PROPERTY_DEFAULTS[name]?.[0])
}

export function resolvedCompositionProperties(changed: Record<string, string>, resolved: Record<string, string>): Record<string, string> {
  if (!WORD_SPACING_PROPERTIES.some((name) => changed[name] !== undefined)) return {}
  return Object.fromEntries(WORD_SPACING_PROPERTIES.map((name) => [name, changed[name] ?? resolved[name] ?? defaultValue(name)]))
}

interface CompositionStyleDeclarationsOptions {
  values: Record<string, string>
  mapped: ReadonlySet<string>
  report: ReportCollector
  unsupported: Map<string, number>
  location: string
}

function wordSpacingDeclaration(options: CompositionStyleDeclarationsOptions): string | undefined {
  const { values, mapped, report, unsupported, location } = options
  if (!WORD_SPACING_PROPERTIES.some((name) => mapped.has(name))) return undefined
  const spacing = parseWordSpacing(WORD_SPACING_PROPERTIES.map((name) => `${values[name] ?? defaultValue(name)}%`).join(' '))
  if (spacing) return `${WORD_SPACING_CUSTOM_PROPERTY}:${serializeWordSpacing(spacing)}`
  for (const name of WORD_SPACING_PROPERTIES) if (mapped.has(name)) report.add(unsupported, name, location)
  return undefined
}

export function compositionStyleDeclarations(options: CompositionStyleDeclarationsOptions): string[] {
  const { values, mapped, report, unsupported, location } = options
  const output: string[] = []
  if (mapped.has('Composer')) {
    const composer = COMPOSERS[values.Composer ?? '']
    if (composer) output.push(`${COMPOSER_CUSTOM_PROPERTY}:${composer}`)
    else report.add(unsupported, 'Composer', location)
  }
  const wordSpacing = wordSpacingDeclaration(options)
  if (wordSpacing) output.push(wordSpacing)
  if (mapped.has('Hyphenation')) {
    if (values.Hyphenation === 'true' || values.Hyphenation === 'false') output.push(`${HYPHENATE_CUSTOM_PROPERTY}:${values.Hyphenation}`)
    else report.add(unsupported, 'Hyphenation', location)
  }
  return output
}

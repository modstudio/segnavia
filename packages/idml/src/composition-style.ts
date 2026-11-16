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
interface ComposerMapping {
  value: (typeof COMPOSER_VALUES)[number]
  approximated: boolean
}

const COMPOSERS: Readonly<Record<string, ComposerMapping>> = {
  '$ID/HL Composer Optyca': { value: PARAGRAPH_COMPOSER, approximated: true },
  'HL Composer Optyca': { value: PARAGRAPH_COMPOSER, approximated: true },
  '$ID/Adobe Paragraph Composer': { value: PARAGRAPH_COMPOSER, approximated: false },
  'Adobe Paragraph Composer': { value: PARAGRAPH_COMPOSER, approximated: false },
  '$ID/Adobe World-Ready Paragraph Composer': { value: PARAGRAPH_COMPOSER, approximated: true },
  'Adobe World-Ready Paragraph Composer': { value: PARAGRAPH_COMPOSER, approximated: true },
  '$ID/HL Single Optyca': { value: SINGLE_LINE_COMPOSER, approximated: true },
  'HL Single Optyca': { value: SINGLE_LINE_COMPOSER, approximated: true },
  '$ID/Adobe Single-line Composer': { value: SINGLE_LINE_COMPOSER, approximated: false },
  'Adobe Single-line Composer': { value: SINGLE_LINE_COMPOSER, approximated: false },
  '$ID/Adobe World-Ready Single-line Composer': { value: SINGLE_LINE_COMPOSER, approximated: true },
  'Adobe World-Ready Single-line Composer': { value: SINGLE_LINE_COMPOSER, approximated: true },
}

export function isApproximatedComposer(value: string): boolean {
  return COMPOSERS[value]?.approximated ?? false
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
    if (composer) output.push(`${COMPOSER_CUSTOM_PROPERTY}:${composer.value}`)
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

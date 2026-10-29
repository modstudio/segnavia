import { stylePropertyMapping } from './style-mappings.ts'

// These are InDesign's defaults for properties that otherwise look like active formatting.
export const INDESIGN_PROPERTY_DEFAULTS: Readonly<Record<string, readonly (string | number | boolean)[]>> = {
  HorizontalScale: [100],
  VerticalScale: [100],
  Skew: [0],
  BaselineShift: [0],
  DesiredWordSpacing: [100],
  MinimumWordSpacing: [80],
  MaximumWordSpacing: [133],
  DesiredLetterSpacing: [0],
  MinimumLetterSpacing: [0],
  MaximumLetterSpacing: [0],
  DesiredGlyphScaling: [100],
  MinimumGlyphScaling: [100],
  MaximumGlyphScaling: [100],
  FillTint: [-1, 100],
  KerningMethod: ['$ID/Metrics'],
  Ligatures: [true],
  OTFContextualAlternate: [true],
  OTFMark: [true],
  OTFFigureStyle: ['Default'],
  OTFLocale: [true],
  PositionalForm: ['None'],
  CharacterAlignment: ['AlignEmCenter'],
  DigitsType: ['DefaultDigits'],
  CharacterDirection: ['DefaultDirection'],
  DiacriticPosition: ['OpentypePositionFromBaseline'],
  XOffsetDiacritic: [0],
  YOffsetDiacritic: [0],
  Kashidas: ['DefaultKashidas'],
  ParagraphKashidaWidth: [2],
  ParagraphJustification: ['DefaultJustification'],
  GlyphForm: ['None'],
  MiterLimit: [4],
  EndJoin: ['MiterEndJoin'],
  NoBreak: [false],
  SingleWordJustification: ['LeftAlign'],
  'OTF*': [false],
}

const JUSTIFICATION_SETTINGS = new Set([
  'DesiredWordSpacing',
  'MinimumWordSpacing',
  'MaximumWordSpacing',
  'DesiredLetterSpacing',
  'MinimumLetterSpacing',
  'MaximumLetterSpacing',
  'DesiredGlyphScaling',
  'MinimumGlyphScaling',
  'MaximumGlyphScaling',
  'SingleWordJustification',
])

const CJK_PREFIXES = ['Kinsoku', 'Shatai', 'CjkGrid', 'Grid', 'AutoTcy']
const CJK_PROPERTIES = new Set([
  'Mojikumi',
  'Jidori',
  'Rensuuji',
  'BunriKinshi',
  'Tsume',
  'LeadingAki',
  'TrailingAki',
  'Gyoudori',
  'ParagraphGyoudori',
  'KeyboardDirection',
  'TreatIdeographicSpaceAsSpace',
  'CharacterRotation',
  'RotateSingleByteCharacters',
])

interface SwitchedGroup {
  matches: (name: string) => boolean
  enabled: (properties: Record<string, string>) => boolean
  reportAs: string
}

function truthy(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true'
}

function notNone(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase()
  return Boolean(normalized && !['none', '$id/none', 'nolist'].includes(normalized))
}

const SWITCHED_GROUPS: SwitchedGroup[] = [
  { matches: (name) => name.startsWith('RuleAbove'), enabled: (values) => truthy(values.RuleAbove), reportAs: 'RuleAbove' },
  { matches: (name) => name.startsWith('RuleBelow'), enabled: (values) => truthy(values.RuleBelow), reportAs: 'RuleBelow' },
  { matches: (name) => name.startsWith('ParagraphBorder'), enabled: (values) => truthy(values.ParagraphBorderOn), reportAs: 'ParagraphBorderOn' },
  { matches: (name) => name.startsWith('Underline'), enabled: (values) => truthy(values.Underline) || values.Underline === 'Underline', reportAs: 'Underline' },
  {
    matches: (name) => name.startsWith('StrikeThrough') || name.startsWith('StrikeThru'),
    enabled: (values) => truthy(values.StrikeThru ?? values.StrikeThrough),
    reportAs: 'StrikeThru',
  },
  {
    matches: (name) => name.startsWith('Bullets') || name.startsWith('Numbering'),
    enabled: (values) => notNone(values.BulletsAndNumberingListType),
    reportAs: 'BulletsAndNumberingListType',
  },
  { matches: (name) => name.startsWith('DropCap') || name === 'DropcapDetail', enabled: (values) => Number(values.DropCapLines) > 0, reportAs: 'DropCapLines' },
  { matches: (name) => name.startsWith('Kenten'), enabled: (values) => notNone(values.KentenKind), reportAs: 'KentenKind' },
  { matches: (name) => name.startsWith('Ruby'), enabled: (values) => truthy(values.RubyFlag), reportAs: 'RubyFlag' },
  { matches: (name) => name.startsWith('Warichu'), enabled: (values) => truthy(values.Warichu), reportAs: 'Warichu' },
  { matches: (name) => name.startsWith('Tatechuyoko'), enabled: (values) => truthy(values.Tatechuyoko), reportAs: 'Tatechuyoko' },
  {
    matches: (name) => name.startsWith('Gradient'),
    enabled: (values) => [values.FillColor, values.StrokeColor].some((value) => value?.toLowerCase().includes('gradient')),
    reportAs: 'Gradient',
  },
  {
    matches: (name) => name.startsWith('Stroke'),
    enabled: (values) => Number(values.StrokeWeight) > 0 && notNone(values.StrokeColor),
    reportAs: 'Stroke',
  },
]

function equalsDefault(name: string, value: string): boolean {
  const defaults = INDESIGN_PROPERTY_DEFAULTS[name] ?? (name.startsWith('OTF') ? INDESIGN_PROPERTY_DEFAULTS['OTF*'] : undefined)
  if (!defaults) return false
  const normalized = value.trim().toLowerCase()
  return defaults.some((candidate) => String(candidate).toLowerCase() === normalized)
}

function hasEntries(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase()
  return Boolean(normalized && !['false', '0', 'none', '$id/none', '[]'].includes(normalized))
}

function isCjkLanguage(value: string | undefined): boolean {
  return /(?:chinese|japanese|korean|^zh(?:-|$)|^ja(?:-|$)|^ko(?:-|$))/i.test(value ?? '')
}

export function activeIdmlValue(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  if (!normalized || ['false', 'none', 'nothing', '$id/none', '$id/nothing', 'n', 'no', 'off'].includes(normalized)) return false
  const numbers = normalized.split(/[\s,]+/).map(Number)
  return numbers.length === 0 || !numbers.every((number) => Number.isFinite(number) && number === 0)
}

function isHyphenationProperty(name: string): boolean {
  return name.startsWith('Hyphenat') || name === 'HyphenWeight' || name === 'ProviderHyphenationStyle'
}

function alwaysHandledElsewhere(name: string): boolean {
  return isHyphenationProperty(name) || JUSTIFICATION_SETTINGS.has(name) || ['EmptyGrepStyles', 'EmptyNestedStyles', 'EmptyLineStyles'].includes(name)
}

function groupedProperties(names: string[], resolved: Record<string, string>): string[] {
  const output: string[] = []
  if (names.some(isHyphenationProperty) && truthy(resolved.Hyphenation)) output.push('Hyphenation')
  const changedJustification = [...JUSTIFICATION_SETTINGS].some((name) => {
    const value = resolved[name]
    return value !== undefined && !equalsDefault(name, value)
  })
  if (names.some((name) => JUSTIFICATION_SETTINGS.has(name)) && changedJustification) output.push('JustificationSettings')
  return output
}

function reportableProperty(name: string, value: string, resolved: Record<string, string>, root: boolean): string | undefined {
  if (stylePropertyMapping(name)) return undefined
  if (alwaysHandledElsewhere(name)) return undefined
  if (['AllGREPStyles', 'AllNestedStyles', 'AllLineStyles'].includes(name) || name === 'TabList') return hasEntries(value) ? name : undefined
  if (name.startsWith('ParagraphShading')) return truthy(resolved.ParagraphShadingOn) && activeIdmlValue(value) ? name : undefined
  const switched = SWITCHED_GROUPS.find((group) => group.matches(name))
  if (switched) return switched.enabled(resolved) ? switched.reportAs : undefined
  const cjkOnly = CJK_PREFIXES.some((prefix) => name.startsWith(prefix)) || CJK_PROPERTIES.has(name)
  if (cjkOnly && !isCjkLanguage(resolved.AppliedLanguage)) return undefined
  if (equalsDefault(name, value)) return undefined
  return !root || activeIdmlValue(value) ? name : undefined
}

export function reportableStyleProperties(source: Record<string, string>, resolved: Record<string, string>, root = false): string[] {
  const names = Object.keys(source)
  const output = new Set(groupedProperties(names, resolved))
  for (const name of names) {
    const value = source[name]
    if (value === undefined) continue
    const reported = reportableProperty(name, value, resolved, root)
    if (reported) output.add(reported)
  }
  return [...output]
}

import { type FontReference, type FontReferenceInput, FontReferenceInput as FontReferenceInputSchema } from '@segnavia/format'
import type { Element } from 'domhandler'
import { refusal } from './refusal.ts'
import type { ReportCollector } from './report.ts'
import type { IdmlFont } from './types.ts'
import { localName } from './xml.ts'

export const IDML_FONT_WEIGHTS: Readonly<Record<string, number>> = {
  thin: 100,
  extralight: 200,
  ultralight: 200,
  light: 300,
  regular: 400,
  book: 400,
  normal: 400,
  roman: 400,
  medium: 500,
  semibold: 600,
  demibold: 600,
  bold: 700,
  extrabold: 800,
  heavy: 800,
  black: 900,
}

export function idmlFontStyle(name: string | undefined): { weight?: number; style?: 'italic' } {
  if (!name) return {}
  const normalized = name.toLowerCase().replace(/[\s-]+/g, '')
  const italic = normalized.endsWith('italic') ? 'italic' : normalized.endsWith('oblique') ? 'oblique' : undefined
  const weightName = italic ? normalized.slice(0, -italic.length) || 'regular' : normalized
  const weight = IDML_FONT_WEIGHTS[weightName]
  return { ...(weight === undefined ? {} : { weight }), ...(italic ? { style: 'italic' as const } : {}) }
}

export function parseFonts(roots: Element[]): IdmlFont[] {
  return roots
    .filter((element) => localName(element.name) === 'Font')
    .flatMap((element) => {
      const family = element.attribs.FontFamily
      if (!family) return []
      const style = element.attribs.FontStyleName
      const postscriptName = element.attribs.PostScriptName
      return [{ family, ...(style ? { style } : {}), ...(postscriptName ? { postscriptName } : {}) }]
    })
}

function css(reference: FontReference): string {
  return 'app' in reference ? `var(--segnavia-font-${reference.app})` : `${JSON.stringify(reference.local)}, var(--segnavia-font-${reference.fallback})`
}

export class FontMapper {
  private readonly cache = new Map<string, FontReference | undefined>()
  private readonly references = new Map<string, FontReference>()

  constructor(
    private readonly fonts: IdmlFont[],
    private readonly map: ((font: IdmlFont) => FontReferenceInput | undefined) | undefined,
    private readonly report: ReportCollector,
  ) {}

  declarations(family: string | undefined, style: string | undefined, location: string): string[] {
    if (!family) return []
    const reference = this.resolve(family, style, location)
    const face = idmlFontStyle(style)
    return [
      ...(reference ? [`font-family:${css(reference)}`] : []),
      ...(face.weight === undefined ? [] : [`font-weight:${face.weight}`]),
      ...(face.style ? [`font-style:${face.style}`] : []),
    ]
  }

  bookFonts(): FontReference[] {
    return [...this.references.values()]
  }

  private resolve(family: string, style: string | undefined, location: string): FontReference | undefined {
    const key = `${family}\u0000${style ?? ''}`
    if (this.cache.has(key)) {
      if (!this.cache.get(key)) this.report.unmappedFont(family, style, location)
      return this.cache.get(key)
    }
    const known = this.fonts.find((font) => font.family === family && font.style === style)
    const font: IdmlFont = { family, ...(style ? { style } : {}), ...(known?.postscriptName ? { postscriptName: known.postscriptName } : {}) }
    const answer = this.map?.(font)
    if (answer === undefined) {
      this.cache.set(key, undefined)
      this.report.unmappedFont(family, style, location)
      return undefined
    }
    const parsed = FontReferenceInputSchema.safeParse(answer)
    if (!parsed.success) {
      throw refusal(
        `the host font mapping for ${JSON.stringify(family)}${style ? ` style ${JSON.stringify(style)}` : ''} is invalid`,
        'return an app or local font reference with a valid app-font fallback',
      )
    }
    const reference = parsed.data
    this.cache.set(key, reference)
    this.add(reference)
    if ('local' in reference) this.add({ app: reference.fallback })
    return reference
  }

  private add(reference: FontReference): void {
    this.references.set(JSON.stringify(reference), reference)
  }
}

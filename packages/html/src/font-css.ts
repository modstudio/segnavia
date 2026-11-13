import {
  APP_FONT_NAME,
  type AppFont,
  FONT_FORMATS,
  type FontFace,
  FontFaceRefusedError,
  type FontFormat,
  fontWeightRange,
  Refusal,
  type RefusalOptions,
  type ResolvedFontFace,
  resolveFontFace,
} from '@segnavia/format'
import { bytesToBase64 } from './base64.ts'
import { quoteFamily } from './css-family.ts'
import { parseUnicodeRange, UNICODE_RANGE_CLEARANCE } from './unicode-range.ts'

export class FontCssRefusedError extends Refusal {
  constructor(message: string, options?: RefusalOptions) {
    super('font-css', message, options)
    this.name = 'FontCssRefusedError'
  }
}

function mimeType(format: FontFormat): string {
  if (format === 'truetype') return 'ttf'
  if (format === 'opentype') return 'otf'
  return format
}

function unicodeRangeDeclaration(font: FontFace): string {
  const range: unknown = font.unicodeRange
  if (range === undefined) return ''
  const refused = (reason: string) =>
    new FontCssRefusedError(
      `The unicode-range ${JSON.stringify(range)} on face ${JSON.stringify(font.family)} (${font.weight ?? 'normal'}, ${font.style ?? 'normal'}) is malformed: ${reason}. Supply a CSS unicode-range list (${UNICODE_RANGE_CLEARANCE}) to clear this refusal.`,
    )
  if (typeof range !== 'string') throw refused(`it is not a string (${typeof range})`)
  const parsed = parseUnicodeRange(range)
  if (!parsed.ok) throw refused(parsed.reason)
  return `unicode-range:${parsed.value};`
}

function faceRefusal(font: FontFace, problem: string, remedy: string): FontCssRefusedError {
  return new FontCssRefusedError(`The face ${JSON.stringify(font.family)} could not establish ${problem}; ${remedy} to clear this refusal.`)
}

function isCssWeight(value: FontFace['weight']): boolean {
  // A supplied face is CSS text or a number; an array is a declaration's range, which CSS cannot read.
  return (value === undefined || typeof value === 'number' || typeof value === 'string') && fontWeightRange(value) !== null
}

function isFontFormat(value: FontFace['format']): value is FontFormat {
  return FONT_FORMATS.some((format) => format === value)
}

function quotedFamily(family: string): string {
  return quoteFamily(family, {
    quote: 'always',
    controlCharacter: (refused) => {
      throw new FontCssRefusedError(
        `The family ${JSON.stringify(refused)} contains a control character; remove control characters from the family name to clear this refusal.`,
      )
    },
  })
}

function validatedFace(font: FontFace): FontFace {
  if (!isFontFormat(font.format)) {
    throw faceRefusal(font, `a font format that is one of ${FONT_FORMATS.join(', ')}`, `supply one of ${FONT_FORMATS.join(', ')}`)
  }
  if (!isCssWeight(font.weight)) {
    throw faceRefusal(font, 'a CSS font-weight', "supply a number 1-1000, two such numbers low then high, or 'normal' or 'bold'")
  }
  if (font.style !== undefined && font.style !== 'normal' && font.style !== 'italic') {
    throw faceRefusal(font, "a font-style of 'normal' or 'italic'", "supply 'normal' or 'italic'")
  }
  return font
}

export function fontFaceCss(font: FontFace): string {
  const validated = validatedFace(font)
  let resolved: ResolvedFontFace
  try {
    resolved = resolveFontFace(validated.data, validated.format, validated.postscriptName)
  } catch (error) {
    if (error instanceof FontFaceRefusedError) {
      throw new FontCssRefusedError(error.message, {
        cause: error,
        refusals: [{ code: error.code, subject: error.subject, message: error.message }],
      })
    }
    throw error
  }
  const face = { ...validated, ...resolved }
  return `@font-face{font-family:${quotedFamily(face.family)};src:url(data:font/${mimeType(face.format)};base64,${bytesToBase64(face.data)}) format(${JSON.stringify(face.format)});font-weight:${face.weight ?? 'normal'};font-style:${face.style ?? 'normal'};${unicodeRangeDeclaration(face)}font-display:block}`
}

function customProperty(name: string, font: AppFont): string {
  if (!APP_FONT_NAME.test(name)) {
    throw new FontCssRefusedError(
      `The app font name ${JSON.stringify(name)} could not establish an app font name matching ${APP_FONT_NAME}; use a lowercase name of letters, digits and hyphens to clear this refusal.`,
    )
  }
  const generic = font.generic ? `,${font.generic}` : ''
  return `--segnavia-font-${name}:${quotedFamily(font.family)}${generic}`
}

export function fontCss(options: { app: Map<string, AppFont>; local?: readonly FontFace[] }): string {
  const faces: FontFace[] = []
  const properties: string[] = []
  for (const [name, font] of options.app) {
    faces.push(...font.faces)
    properties.push(customProperty(name, font))
  }
  for (const font of options.local ?? []) faces.push(font)
  const rules = faces.map(fontFaceCss).join('')
  if (properties.length === 0) return rules
  return `${rules}:root{${properties.join(';')}}`
}

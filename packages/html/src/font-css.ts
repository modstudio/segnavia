import { APP_FONT_NAME, type AppFont, FONT_FORMATS, type FontFace, type FontFormat } from '@segnavia/format'
import { bytesToBase64 } from './base64.ts'
import { hasControlChar } from './control-char.ts'
import { parseUnicodeRange, UNICODE_RANGE_CLEARANCE } from './unicode-range.ts'

export class FontCssRefusedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FontCssRefusedError'
  }
}

const CSS_WEIGHT_KEYWORD = /^(?:normal|bold|bolder|lighter)$/
const CSS_WEIGHT_NUMBER = /^(?:[1-9]\d{0,2}|1000)$/
const CSS_WEIGHT_RANGE = /^((?:[1-9]\d{0,2}|1000)) ((?:[1-9]\d{0,2}|1000))$/

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

function isCssWeightNumber(value: string): boolean {
  return CSS_WEIGHT_NUMBER.test(value) && Number(value) >= 1 && Number(value) <= 1000
}

function isCssWeight(value: FontFace['weight']): boolean {
  if (value === undefined) return true
  if (typeof value === 'number') return Number.isInteger(value) && value >= 1 && value <= 1000
  if (CSS_WEIGHT_KEYWORD.test(value) || isCssWeightNumber(value)) return true
  const range = CSS_WEIGHT_RANGE.exec(value)
  return range !== null && Number(range[1]) <= Number(range[2])
}

function isFontFormat(value: FontFace['format']): value is FontFormat {
  return FONT_FORMATS.some((format) => format === value)
}

// A family sits in a <style> element, so `<` is the CSS hex escape `\3c `.
function quoteFamily(family: string): string {
  if (hasControlChar(family)) {
    throw new FontCssRefusedError(
      `The family ${JSON.stringify(family)} contains a control character; remove control characters from the family name to clear this refusal.`,
    )
  }
  let quoted = '"'
  for (const ch of family) {
    if (ch === '\\' || ch === '"') quoted += `\\${ch}`
    else if (ch === '<') quoted += '\\3c '
    else quoted += ch
  }
  return `${quoted}"`
}

function validatedFace(font: FontFace): FontFace {
  if (!isFontFormat(font.format)) {
    throw faceRefusal(font, `a font format that is one of ${FONT_FORMATS.join(', ')}`, `supply one of ${FONT_FORMATS.join(', ')}`)
  }
  if (!isCssWeight(font.weight)) {
    throw faceRefusal(font, 'a CSS font-weight', 'supply a number 1-1000, two such numbers low then high, or a CSS weight keyword')
  }
  if (font.style !== undefined && font.style !== 'normal' && font.style !== 'italic') {
    throw faceRefusal(font, "a font-style of 'normal' or 'italic'", "supply 'normal' or 'italic'")
  }
  return font
}

export function fontFaceCss(font: FontFace): string {
  const face = validatedFace(font)
  return `@font-face{font-family:${quoteFamily(face.family)};src:url(data:font/${mimeType(face.format)};base64,${bytesToBase64(face.data)}) format(${JSON.stringify(face.format)});font-weight:${face.weight ?? 'normal'};font-style:${face.style ?? 'normal'};${unicodeRangeDeclaration(face)}font-display:block}`
}

function customProperty(name: string, font: AppFont): string {
  if (!APP_FONT_NAME.test(name)) {
    throw new FontCssRefusedError(
      `The app font name ${JSON.stringify(name)} could not establish an app font name matching ${APP_FONT_NAME}; use a lowercase name of letters, digits and hyphens to clear this refusal.`,
    )
  }
  const generic = font.generic ? `,${font.generic}` : ''
  return `--segnavia-font-${name}:${quoteFamily(font.family)}${generic}`
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

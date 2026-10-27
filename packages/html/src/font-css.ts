import type { AppFont, FontFace } from '@segnavia/format'
import { bytesToBase64 } from './base64.ts'
import { parseUnicodeRange, UNICODE_RANGE_CLEARANCE } from './unicode-range.ts'

export class FontCssRefusedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FontCssRefusedError'
  }
}

function mimeType(format: FontFace['format']): string {
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

function hasControlChar(family: string): boolean {
  for (let i = 0; i < family.length; i += 1) {
    const code = family.charCodeAt(i)
    if (code <= 0x1f || code === 0x7f) return true
  }
  return false
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

export function fontFaceCss(font: FontFace): string {
  return `@font-face{font-family:${quoteFamily(font.family)};src:url(data:font/${mimeType(font.format)};base64,${bytesToBase64(font.data)}) format(${JSON.stringify(font.format)});font-weight:${font.weight ?? 'normal'};font-style:${font.style ?? 'normal'};${unicodeRangeDeclaration(font)}font-display:block}`
}

function customProperty(name: string, font: AppFont): string {
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

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

export function fontFaceCss(font: FontFace): string {
  return `@font-face{font-family:${JSON.stringify(font.family)};src:url(data:font/${mimeType(font.format)};base64,${bytesToBase64(font.data)}) format(${JSON.stringify(font.format)});font-weight:${font.weight ?? 'normal'};font-style:${font.style ?? 'normal'};${unicodeRangeDeclaration(font)}font-display:block}`
}

function quoteFamily(family: string): string {
  return JSON.stringify(family)
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

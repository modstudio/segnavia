import { RenderRefusedError } from './errors.ts'
import type { Font } from './options.ts'
import { parseUnicodeRange } from './unicode-range.ts'

function unicodeRangeDeclaration(font: Font): string {
  if (font.unicodeRange === undefined) return ''
  const parsed = parseUnicodeRange(font.unicodeRange)
  if (!parsed.ok) {
    throw new RenderRefusedError(
      `The unicode-range ${JSON.stringify(font.unicodeRange)} on face ${JSON.stringify(font.family)} (${font.weight ?? 'normal'}, ${font.style ?? 'normal'}) is malformed: ${parsed.reason}. Supply a CSS unicode-range list (U+hex, U+hex-hex, or U+hex with ? wildcards; code points at most 10FFFF) to clear this refusal.`,
    )
  }
  return `unicode-range:${parsed.value};`
}

export function fontFaces(fonts: Font[] = []): string {
  return fonts
    .map(
      (font) =>
        `@font-face{font-family:${JSON.stringify(font.family)};src:url(data:font/${font.format === 'truetype' ? 'ttf' : font.format === 'opentype' ? 'otf' : font.format};base64,${Buffer.from(font.data).toString('base64')}) format(${JSON.stringify(font.format)});font-weight:${font.weight ?? 'normal'};font-style:${font.style ?? 'normal'};${unicodeRangeDeclaration(font)}font-display:block}`,
    )
    .join('')
}

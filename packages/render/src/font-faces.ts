import { RenderRefusedError } from './errors.ts'
import type { Font } from './options.ts'
import { parseUnicodeRange, UNICODE_RANGE_CLEARANCE } from './unicode-range.ts'

function unicodeRangeDeclaration(font: Font): string {
  const range: unknown = font.unicodeRange
  if (range === undefined) return ''
  const refused = (reason: string) =>
    new RenderRefusedError(
      `The unicode-range ${JSON.stringify(range)} on face ${JSON.stringify(font.family)} (${font.weight ?? 'normal'}, ${font.style ?? 'normal'}) is malformed: ${reason}. Supply a CSS unicode-range list (${UNICODE_RANGE_CLEARANCE}) to clear this refusal.`,
    )
  if (typeof range !== 'string') throw refused(`it is not a string (${typeof range})`)
  const parsed = parseUnicodeRange(range)
  if (!parsed.ok) throw refused(parsed.reason)
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

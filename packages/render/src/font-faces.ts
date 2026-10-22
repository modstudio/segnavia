import type { Font } from './options.ts'

export function fontFaces(fonts: Font[] = []): string {
  return fonts
    .map(
      (font) =>
        `@font-face{font-family:${JSON.stringify(font.family)};src:url(data:font/${font.format === 'truetype' ? 'ttf' : font.format === 'opentype' ? 'otf' : font.format};base64,${Buffer.from(font.data).toString('base64')}) format(${JSON.stringify(font.format)});font-weight:${font.weight ?? 'normal'};font-style:${font.style ?? 'normal'};font-display:block}`,
    )
    .join('')
}

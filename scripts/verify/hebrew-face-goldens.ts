import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { type FontSource, HEBREW_UNICODE_RANGE } from '@segnavia/format'
import type { Renderer } from '@segnavia/render'
import { screenPage } from '../screen-document.ts'
import { fontRows, pointedLines, pointMultiset, unpointed } from './hebrew-text.ts'

type Check = (what: string, ok: boolean, detail?: string) => void

const faces = [
  // Alef has nikud but no U+0591-05AF taamim glyphs, so its specimen stops at the marks the face can own without fallback.
  { id: 'alef', family: 'Alef', postscript: 'Alef-Regular', file: 'Alef-Regular.ttf' },
  { id: 'noto-serif-hebrew', family: 'Noto Serif Hebrew', postscript: 'NotoSerifHebrew-Regular', file: 'NotoSerifHebrew-Regular.ttf' },
] as const

export async function verifyHebrewFaceGoldens(renderer: Renderer, work: string, check: Check): Promise<void> {
  const fonts = path.resolve(import.meta.dirname, '../../fixtures/hebrew-notice')
  const fixtures = path.resolve(import.meta.dirname, '../../fixtures/hebrew-faces')
  for (const face of faces) {
    const html = readFileSync(path.join(fixtures, `${face.id}.html`), 'utf8')
    const source: FontSource = {
      font: async (name) =>
        name === 'hebrew'
          ? {
              family: face.family,
              faces: [{ family: face.family, data: readFileSync(path.join(fonts, face.file)), format: 'truetype', unicodeRange: HEBREW_UNICODE_RANGE }],
              generic: 'serif',
            }
          : undefined,
    }
    const page = screenPage(
      { html },
      { size: { width: 816, height: 1056 }, settings: { lang: 'he', dir: 'rtl' }, style: { fonts: { hebrew: { faces: [{ script: 'hebrew' }] } } } },
    )
    const pdf = await renderer.pagePdf(page, { fontSource: source })
    const file = path.join(work, `hebrew-face-${face.id}.pdf`)
    writeFileSync(file, pdf)
    const rows = fontRows(execFileSync('pdffonts', [file], { encoding: 'utf8' }))
    check(
      `${face.family} specimen embeds only its declared face`,
      rows.length > 0 && rows.every((row) => new RegExp(`^\\S*\\+${face.postscript}\\s`).test(row)),
      rows.join('; '),
    )
    const extracted = execFileSync('pdftotext', ['-enc', 'UTF-8', file, '-'], { encoding: 'utf8' })
    const sourceLines = pointedLines(html)
    check(
      `${face.family} specimen text layer keeps every source mark`,
      pointMultiset(extracted) === pointMultiset(sourceLines.join('')),
      `source=${pointMultiset(sourceLines.join('')).length}, extracted=${pointMultiset(extracted).length}`,
    )
    const unpointedExtracted = unpointed(extracted)
    let cursor = 0
    const ordered = sourceLines.every((line) => {
      const found = unpointedExtracted.indexOf(unpointed(line), cursor)
      if (found < 0) return false
      cursor = found + unpointed(line).length
      return true
    })
    check(`${face.family} specimen keeps its base text in logical order`, ordered)
    check(`${face.family} specimen has no dotted-circle replacement`, !extracted.includes('\u25cc'))
  }
}

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { AppFont, FontSource } from '@segnavia/format'
import type { Renderer } from '@segnavia/render'

type Check = (what: string, ok: boolean, detail?: string) => void

const ALEF = path.resolve(import.meta.dirname, '../../fixtures/hebrew-notice/Alef-Regular.ttf')

function fontRows(output: string): string[] {
  return output
    .split('\n')
    .slice(2)
    .map((line) => line.trim())
    .filter(Boolean)
}

export async function verifyFontSource(renderer: Renderer, work: string, check: Check): Promise<void> {
  const serif: AppFont = {
    family: 'Body Serif',
    faces: [{ family: 'Body Serif', data: readFileSync(ALEF), format: 'truetype' }],
    generic: 'serif',
  }
  const fontSource: FontSource = {
    font: async (name) => (name === 'serif' ? serif : undefined),
  }
  const pdf = await renderer.pagePdf(
    {
      html: '<p style="font-family: var(--segnavia-font-serif)">Embedded</p>',
      fonts: [{ app: 'serif' }],
      size: { width: 400, height: 200 },
    },
    {
      fontSource,
      css: 'p{font-size:40px}',
    },
  )
  const file = path.join(work, 'font-source.pdf')
  writeFileSync(file, pdf)
  const rows = fontRows(execFileSync('pdffonts', [file], { encoding: 'utf8' }))
  const alef = rows.filter((row) => /(?:^|\+)Alef-Regular\s/.test(row))
  check('a FontSource page whose CSS uses only var(--segnavia-font-serif) embeds the face', alef.length === 1, rows.join('; '))
}

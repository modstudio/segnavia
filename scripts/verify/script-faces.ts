import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Renderer } from '@segnavia/render'

type Check = (what: string, ok: boolean, detail?: string) => void

const SANS = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
const ALEF = path.resolve(import.meta.dirname, '../../fixtures/hebrew-notice/Alef-Regular.ttf')

function fontRows(output: string): string[] {
  return output
    .split('\n')
    .slice(2)
    .map((line) => line.trim())
    .filter(Boolean)
}

export async function verifyScriptFaces(renderer: Renderer, work: string, check: Check): Promise<void> {
  // DejaVu Sans is the Latin pair for the same-family unicode-range demo; without it both embeds cannot be observed.
  if (!existsSync(SANS)) return
  const pdf = await renderer.pagePdf(
    { html: '<p style="font-family:\'Segnavia Scripts\'">שלום Hello</p>', size: { width: 400, height: 200 } },
    {
      fonts: [
        { family: 'Segnavia Scripts', data: readFileSync(ALEF), format: 'truetype', unicodeRange: 'U+0590-05FF, U+FB1D-FB4F' },
        { family: 'Segnavia Scripts', data: readFileSync(SANS), format: 'truetype', unicodeRange: 'U+0000-024F' },
      ],
      css: 'p{font-size:40px}',
    },
  )
  const file = path.join(work, 'script-faces.pdf')
  writeFileSync(file, pdf)
  const rows = fontRows(execFileSync('pdffonts', [file], { encoding: 'utf8' }))
  const alef = rows.filter((row) => /(?:^|\+)Alef-Regular\s/.test(row))
  const dejavu = rows.filter((row) => /(?:^|\+)DejaVuSans\s/.test(row))
  check(
    'two same-family script faces embed Alef and DejaVu Sans and no other face',
    rows.length === 2 && alef.length === 1 && dejavu.length === 1,
    rows.join('; '),
  )
}

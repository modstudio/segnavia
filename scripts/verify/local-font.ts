import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { packLocalFaces } from '@segnavia/frame/local-fonts'
import type { Renderer } from '@segnavia/render'

type Check = (what: string, ok: boolean, detail?: string) => void

const ALEF = path.resolve(import.meta.dirname, '../../fixtures/hebrew-notice/Alef-Regular.ttf')

export async function verifyLocalFont(renderer: Renderer, work: string, check: Check): Promise<void> {
  const family = 'Demo Local Family'
  const references = [{ local: family, fallback: 'serif' }] as const
  const faces = packLocalFaces([{ family, data: readFileSync(ALEF), format: 'truetype' }], references)
  const reports: unknown[] = []
  const pdf = await renderer.pagePdf(
    {
      html: `<p style="font-family:'${family}',var(--segnavia-font-serif)">Local face</p>`,
      fonts: [...references],
      size: { width: 400, height: 200 },
    },
    {
      fontSource: { font: async (name) => (name === 'serif' ? { family: 'Fallback Serif', faces: [], generic: 'serif' } : undefined) },
      localFonts: { faces, report: (report) => reports.push(report) },
      css: 'p{font-size:40px}',
    },
  )
  const file = path.join(work, 'local-font.pdf')
  writeFileSync(file, pdf)
  const rows = execFileSync('pdffonts', [file], { encoding: 'utf8' })
  check(
    'a transported local face whose internal full name differs from its declared family embeds for that family',
    /(?:^|\+)Alef-Regular\s/m.test(rows) && JSON.stringify(reports) === JSON.stringify([{ fellBack: [] }]),
    `${rows.split('\n').slice(2).join(' ').trim()}; reports=${JSON.stringify(reports)}`,
  )
}

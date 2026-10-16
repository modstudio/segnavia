import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Renderer } from '@segnavia/render'

type Check = (what: string, ok: boolean, detail?: string) => void

export async function verifyLongDeckNotes(renderer: Renderer, work: string, check: Check): Promise<void> {
  const longToken = `https://example.invalid/${'unbroken'.repeat(30)}`
  const notes = `${longToken}\n${Array.from({ length: 60 }, (_, index) => `Line ${index + 1}: rendered notes continue.`).join('\n')}`
  const file = path.join(work, 'deck-long-notes.pdf')
  let notesFit = false
  writeFileSync(
    file,
    await renderer.deckPdf(
      {
        title: 'Long notes',
        fit: 'contain',
        size: { width: 1280, height: 720 },
        scripts: 'refuse',
        slides: [{ id: 'long', content: { kind: 'html', html: '<p>Thumbnail only once</p>' }, notes }],
      },
      {
        layout: 'notes',
        beforeOutput: async (tab) => {
          notesFit = await tab
            .locator('.notes')
            .evaluateAll((elements) =>
              elements.every((element) => element.scrollHeight <= element.clientHeight + 1 && element.scrollWidth <= element.clientWidth + 1),
            )
        },
      },
    ),
  )
  const info = execFileSync('pdfinfo', [file], { encoding: 'utf8' })
  const text = execFileSync('pdftotext', [file, '-'], { encoding: 'utf8' })
  const compactText = text.replaceAll(/\s/g, '')
  const thumbnails = text.match(/Thumbnail only once/g)?.length ?? 0
  check(
    'deckPdf flows 60 note lines onto continuation pages and owns the thumbnail only on the first',
    /Pages:\s+[23]\b/.test(info) && text.includes('Line 60: rendered notes continue.') && compactText.includes(longToken) && thumbnails === 1 && notesFit,
    `${info.match(/Pages:\s+\d+/)?.[0] ?? 'page count absent'}, last=${text.includes('Line 60: rendered notes continue.')}, token=${compactText.includes(longToken)}, thumbnail=${thumbnails}, fit=${notesFit}`,
  )
}

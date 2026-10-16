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

  const portraitNotes = 'Portrait notes stay entirely visible.'
  let portraitFacts = { exact: false, visible: false }
  await renderer.deckPdf(
    {
      title: 'Portrait notes',
      fit: 'contain',
      scripts: 'refuse',
      size: { width: 720, height: 1280 },
      slides: [{ id: 'portrait', content: { kind: 'html', html: '<p>Portrait</p>' }, notes: portraitNotes }],
    },
    {
      layout: 'notes',
      beforeOutput: async (tab) => {
        portraitFacts = await tab.locator('.notes').evaluateAll(
          (elements, source) => ({
            exact: elements.map((element) => element.textContent).join('') === source,
            visible: elements.every((element) => element.scrollHeight <= element.clientHeight + 1 && element.scrollWidth <= element.clientWidth + 1),
          }),
          portraitNotes,
        )
      },
    },
  )
  check('deckPdf keeps portrait notes complete and visible', Object.values(portraitFacts).every(Boolean), JSON.stringify(portraitFacts))

  const emojiNotes = '👨‍👩‍👧‍👦'.repeat(1_000)
  let emojiFacts = { exact: false, intact: false, visible: false }
  await renderer.deckPdf(
    {
      title: 'Emoji notes',
      fit: 'contain',
      scripts: 'refuse',
      size: { width: 1280, height: 720 },
      slides: [{ id: 'emoji', content: { kind: 'html', html: '<p>Emoji</p>' }, notes: emojiNotes }],
    },
    {
      layout: 'notes',
      beforeOutput: async (tab) => {
        emojiFacts = await tab.locator('.notes').evaluateAll((elements, source) => {
          return {
            exact: elements.map((element) => element.textContent).join('') === source,
            intact: elements.every((element) => {
              const text = element.textContent ?? ''
              const first = text.charCodeAt(0)
              const last = text.charCodeAt(text.length - 1)
              return !(first >= 0xdc00 && first <= 0xdfff) && !(last >= 0xd800 && last <= 0xdbff)
            }),
            visible: elements.every((element) => element.scrollHeight <= element.clientHeight + 1 && element.scrollWidth <= element.clientWidth + 1),
          }
        }, emojiNotes)
      },
    },
  )
  check('deckPdf splits emoji notes without lone surrogate halves', Object.values(emojiFacts).every(Boolean), JSON.stringify(emojiFacts))

  let reachedOutput = false
  const limited = await renderer
    .deckPdf(
      {
        title: 'Limited notes',
        fit: 'contain',
        scripts: 'refuse',
        size: { width: 1280, height: 720 },
        slides: [{ id: 'limited', content: { kind: 'html', html: '<p>Limited</p>' }, notes: 'A line of notes.\n'.repeat(500) }],
      },
      {
        layout: 'notes',
        limits: { maxSheets: 2 },
        beforeOutput: async () => {
          reachedOutput = true
        },
      },
    )
    .then(
      () => 'rendered',
      (error: unknown) => `${error instanceof Error ? error.name : 'unknown'}: ${error instanceof Error ? error.message : String(error)}`,
    )
  check('deckPdf refuses notes at maxSheets before output', limited.startsWith('RenderRefusedError:') && !reachedOutput, `${limited}, output=${reachedOutput}`)
}

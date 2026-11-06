import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { AppFont, FontSource } from '@segnavia/format'
import type { Renderer } from '@segnavia/render'
import { screenDeck } from '../screen-document.ts'

type Check = (what: string, ok: boolean, detail?: string) => void

const notesDeck = (title: string, id: string, html: string, notes: string, size = { width: 1280, height: 720 }) =>
  screenDeck([{ type: 'slide', id, content: { kind: 'html', html }, notes }], {
    title,
    layout: 'fixed',
    fit: 'contain',
    frame: false,
    settings: { scripts: 'refuse' },
    size,
  })

export async function verifyLongDeckNotes(renderer: Renderer, work: string, check: Check): Promise<void> {
  const longToken = `https://example.invalid/${'unbroken'.repeat(30)}`
  const notes = `${longToken}\n${Array.from({ length: 60 }, (_, index) => `Line ${index + 1}: rendered notes continue.`).join('\n')}`
  const file = path.join(work, 'deck-long-notes.pdf')
  let notesFit = false
  writeFileSync(
    file,
    await renderer.deckPdf(
      notesDeck('Long notes', 'long', '<p>Thumbnail only once</p>', notes),
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
    notesDeck('Portrait notes', 'portrait', '<p>Portrait</p>', portraitNotes, { width: 720, height: 1280 }),
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
    notesDeck('Emoji notes', 'emoji', '<p>Emoji</p>', emojiNotes),
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
      notesDeck('Limited notes', 'limited', '<p>Limited</p>', 'A line of notes.\n'.repeat(500)),
      {
        layout: 'notes',
        limits: { sheets: 2 },
        beforeOutput: async () => {
          reachedOutput = true
        },
      },
    )
    .then(
      () => 'rendered',
      (error: unknown) => `${error instanceof Error ? error.name : 'unknown'}: ${error instanceof Error ? error.message : String(error)}`,
    )
  check(
    'deckPdf refuses notes at limits.sheets before output',
    limited.startsWith('RenderRefusedError:') && !reachedOutput,
    `${limited}, output=${reachedOutput}`,
  )

  const alefPath = path.resolve(import.meta.dirname, '../../fixtures/hebrew-notice/Alef-Regular.ttf')
  const serif: AppFont = {
    family: 'Body Serif',
    faces: [{ family: 'Body Serif', data: readFileSync(alefPath), format: 'truetype' }],
    generic: 'serif',
  }
  const fontSource: FontSource = {
    font: async (name) => (name === 'serif' ? serif : undefined),
  }
  const namedFile = path.join(work, 'deck-notes-font.pdf')
  writeFileSync(
    namedFile,
    await renderer.deckPdf(
      notesDeck('Named notes font', 'named', '<p>Named</p>', 'Speaker notes in the named face.'),
      { layout: 'notes', notesFont: 'serif', fontSource },
    ),
  )
  const fontRows = execFileSync('pdffonts', [namedFile], { encoding: 'utf8' })
    .split('\n')
    .slice(2)
    .map((line) => line.trim())
    .filter(Boolean)
  const alef = fontRows.filter((row) => /(?:^|\+)Alef-Regular\s/.test(row))
  check('deckPdf notes layout embeds the named FontSource face', alef.length >= 1, fontRows.join('; '))
}

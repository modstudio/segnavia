import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { FIRST_CHILD_NOTE_COLOR } from '../demo-book-note-fixtures.ts'
import { type Harness, SITE } from './harness.ts'
import { inspectNoteViewGeometry, pageContainsNoteText } from './paginated-notes.ts'

function pdfPageTexts(file: string): string[] {
  return execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' }).split('\f')
}

function inspectFirstChildNoteColor() {
  const mark = document.querySelector('[data-segnavia-page-note] .first-child-note')
  const note = mark?.closest('[data-segnavia-note]')
  const paragraph = note?.querySelector(':scope > p:first-child')
  return {
    color: paragraph ? getComputedStyle(paragraph).color : '',
    firstChild: Boolean(paragraph),
  }
}

function pageNotes(): string[][] {
  return Array.from(document.querySelectorAll('[data-segnavia-book-page]')).map((page) =>
    Array.from(page.querySelectorAll('[data-segnavia-page-note]')).map((view) => {
      const id = view.getAttribute('data-segnavia-page-note') ?? ''
      const galley = document.querySelector(`[data-segnavia-galley-source] [data-segnavia-note="${id}"]`)
      return galley?.textContent ?? ''
    }),
  )
}

async function notesFrame(h: Harness, id: string) {
  const element = await h.page.$(`#${id}`)
  const frame = await element?.contentFrame()
  if (!frame) throw new Error(`The note-case book frame ${id} did not load.`)
  await frame.waitForFunction(
    () => document.documentElement.hasAttribute('data-segnavia-composed') || document.documentElement.hasAttribute('data-segnavia-compose-failure'),
    undefined,
    { timeout: 20_000 },
  )
  return frame
}

export async function verifyNoteCaseBooks(h: Harness) {
  const { page, check } = h
  await page.goto(h.url('book-paginated-notes.html'))
  for (const language of ['en', 'he'] as const) {
    const id = `book-paginated-notes-${language}`
    const frame = await notesFrame(h, id)
    const failure = await frame.evaluate(() => document.documentElement.getAttribute('data-segnavia-compose-failure'))
    check(`${id} composed without a planner refusal`, !failure, failure ?? 'composed')
    const geometry = await frame.evaluate(inspectNoteViewGeometry)
    check(`${id} every page note's text ink lies in its view`, geometry.views > 0 && geometry.outside === 0 && geometry.empty === 0, geometry.detail)
    const firstChild = await frame.evaluate(inspectFirstChildNoteColor)
    check(
      `${id} the first-child note keeps p:first-child color on the clone`,
      firstChild.firstChild && firstChild.color === FIRST_CHILD_NOTE_COLOR,
      JSON.stringify(firstChild),
    )
    const screens = await frame.evaluate(pageNotes)
    const pages = pdfPageTexts(path.join(SITE, `${id}.pdf`))
    const missing = screens.flatMap((notes, index) =>
      notes.flatMap((note) => (pageContainsNoteText(pages[index] ?? '', note) ? [] : [{ page: index + 1, note }])),
    )
    const noteCount = screens.reduce((count, notes) => count + notes.length, 0)
    check(`${id} prints each page note's whole text`, noteCount > 0 && missing.length === 0, JSON.stringify({ noteCount, missing: missing.slice(0, 5) }))
  }
}

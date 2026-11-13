import { readFileSync } from 'node:fs'
import path from 'node:path'
import { type SideNoteGeometry, sideNoteGeometry } from '../demo-book-line-number-fixtures.ts'
import type { OutlineItem } from './book-pdf-readback.ts'
import { type Harness, SITE } from './harness.ts'

export async function verifyBookSideNotes(h: Harness) {
  await h.page.goto(h.url('book-side-notes.html'))
  for (const language of ['en', 'he'] as const) {
    const frame = h.page.frameLocator(`#book-side-notes-${language} iframe[data-segnavia-book-layout="pages"]`)
    await frame.locator('html[data-segnavia-composed]').waitFor({ timeout: 20_000, state: 'attached' })
    const screen = await frame.locator('html').evaluate(sideNoteGeometry)
    const pdf = JSON.parse(readFileSync(path.join(SITE, `book-side-notes-${language}-pdf-geometry.json`), 'utf8')) as SideNoteGeometry[]
    const outline = JSON.parse(readFileSync(path.join(SITE, `book-side-notes-${language}-pdf-outline.json`), 'utf8')) as OutlineItem[]
    const differences = screen.map((note) => {
      const printed = pdf.find((candidate) => candidate.id === note.id && candidate.page === note.page)
      return printed ? Math.max(Math.abs(note.x - printed.x), Math.abs(note.y - printed.y)) : Number.POSITIVE_INFINITY
    })
    const directions = await frame.locator('[data-segnavia-side-notes] [data-side-note]').evaluateAll((notes) => notes.map((note) => note.getAttribute('dir')))
    const heading = await frame.locator('html').evaluate(() => ({
      count: document.querySelectorAll('#side-heading').length,
      tag: document.getElementById('side-heading')?.tagName,
      text: document.getElementById('side-heading')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      contents: document.querySelector<HTMLAnchorElement>('.segnavia-contents-entry:has(a[href="#side-heading"]) .segnavia-contents-page')?.textContent ?? '',
    }))
    const anchorsMatch = screen.every((note) => Number.isFinite(note.anchorY) && Math.abs(note.y - note.anchorY) <= 0.5)
    const onlyStackDown = screen.every((note) => Number.isFinite(note.anchorY) && note.y >= note.anchorY - 0.5)
    const headingOutline = outline.find((item) => item.title.replace(/\s+/g, ' ').trim() === heading.text)
    h.check(
      `book-side-notes-${language} agrees with PDF and isolates each note`,
      screen.length === 2 &&
        screen.length === pdf.length &&
        differences.every((difference) => difference <= 0.5) &&
        directions.every(Boolean) &&
        (language !== 'he' || directions.every((direction) => direction === 'rtl')) &&
        heading.count === 1 &&
        heading.tag === 'H2' &&
        heading.contents.trim() !== '' &&
        headingOutline !== undefined &&
        headingOutline.page > 0 &&
        anchorsMatch &&
        onlyStackDown,
      JSON.stringify({ screen, pdf, differences, directions, heading, headingOutline, anchorsMatch, onlyStackDown }),
    )
  }
}

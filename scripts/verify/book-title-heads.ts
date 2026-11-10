import { composedFrame } from './composed-frame.ts'
import type { Harness } from './harness.ts'

export async function verifyBookTitleHeads(h: Harness): Promise<void> {
  await h.page.goto(h.url('book-title-heads.html'))
  for (const language of ['en', 'he'] as const) {
    const id = `book-title-heads-${language}`
    const frame = await composedFrame(h, `#${id}`, `The title-head book frame ${id}`)
    const report = await frame.evaluate(() => {
      const bookHead = document.querySelector('.title-head-book-title')
      const sectionHead = document.querySelector('.title-head-section-title')
      const bookPart = bookHead?.querySelector('bdi')
      const sectionPart = sectionHead?.querySelector('bdi')
      return {
        book: { text: bookPart?.textContent ?? '', dir: bookPart?.getAttribute('dir') },
        section: { text: sectionPart?.textContent ?? '', dir: sectionPart?.getAttribute('dir') },
      }
    })
    const expected =
      language === 'he' ? { title: 'ספר ההפלגה', section: 'התחלה', dir: 'rtl' } : { title: 'The Book of Tides', section: 'Beginning', dir: 'ltr' }
    h.check(
      `${id} shows the book title and section title in opposite heads with resolved directions`,
      report.book.text === expected.title &&
        report.book.dir === expected.dir &&
        report.section.text === expected.section &&
        report.section.dir === expected.dir,
      JSON.stringify(report),
    )
  }
}

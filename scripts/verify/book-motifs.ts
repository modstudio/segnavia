import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { type Harness, SITE } from './harness.ts'

export async function verifyContinuousBookMotif(h: Harness, id: 'book-en' | 'book-he') {
  const frame = `#${id}`
  h.check(`${id} expands its front-matter motif on screen`, (await h.page.frameLocator(`${frame} iframe`).locator('[data-book-demo-motif]').count()) === 1)
  const pdfText = execFileSync('pdftotext', [path.join(SITE, `${id}.pdf`), '-'], { encoding: 'utf8' })
  h.check(`${id} expands its front-matter motif in the PDF`, pdfText.includes('BOOK MOTIF'))
}

export async function verifyPaginatedBookMotifs(h: Harness) {
  await h.page.goto(h.url('book-paginated-screen.html'))
  for (const id of ['book-screen-en', 'book-screen-he'] as const) {
    const frame = h.page.frameLocator(`#${id} iframe[data-segnavia-book-layout="pages"]`)
    await frame.locator('[data-segnavia-pages]').waitFor()
    h.check(`${id} expands its front-matter motif on screen`, (await frame.locator('[data-book-demo-motif]').count()) > 0)
    const pdf = id.replace('book-screen', 'book-paginated')
    const pdfText = execFileSync('pdftotext', [path.join(SITE, `${pdf}.pdf`), '-'], { encoding: 'utf8' })
    h.check(`${id} expands its front-matter motif in the PDF`, pdfText.includes('BOOK MOTIF'))
    const furniture = frame
      .locator('[data-segnavia-foot] [data-book-demo-folio]')
      .filter({ hasText: /PRINTED\s+\S/ })
      .first()
    const printed = (await furniture.textContent())?.replace(/^PRINTED\s+/, '').trim()
    const folio = (await furniture.locator('xpath=ancestor::*[@data-segnavia-foot][1]//span[contains(@class,"segnavia-folio")]').textContent())?.trim()
    h.check(
      `${id} fills the furniture motif's printed-page number with its folio on screen`,
      printed !== '' && printed === folio,
      JSON.stringify({ printed, folio }),
    )
    const printedPdf = printed !== undefined && pdfText.split('\n').some((line) => line.includes('PRINTED') && line.includes(printed))
    h.check(`${id} fills the furniture motif's printed-page number in the PDF`, printedPdf, printed)
  }
}

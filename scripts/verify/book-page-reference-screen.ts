import type { Frame } from 'playwright-core'
import type { Harness } from './harness.ts'

const DIRECTIONS: Record<string, string> = { 'book-paginated-en': 'ltr', 'book-paginated-he': 'rtl' }

export async function verifyPaginatedPageReferences(frame: Frame, id: string, check: Harness['check']): Promise<void> {
  const reference = await frame
    .locator('a[data-ref="page"][href="#segnavia-chapter-3"]')
    .first()
    .evaluate((node) => {
      const target = document.getElementById('segnavia-chapter-3')?.closest('[data-segnavia-book-page]')
      return { number: node.textContent?.trim() ?? '', folio: target?.getAttribute('data-segnavia-folio') ?? '', dir: node.getAttribute('dir') }
    })
  check(
    `${id} page reference uses its target page folio and isolates its direction`,
    reference.number !== '' && reference.number === reference.folio && reference.dir === DIRECTIONS[id],
    JSON.stringify(reference),
  )
  const report = await frame.evaluate(() => {
    const target = document.getElementById('segnavia-chapter-3')?.closest('[data-segnavia-book-page]')?.getAttribute('data-segnavia-folio') ?? ''
    const values = Array.from(document.querySelectorAll('[data-segnavia-book-page] [data-segnavia-note] a[data-ref="page"]')).map(
      (node) => node.textContent?.trim() ?? '',
    )
    return { target, values }
  })
  check(
    `${id} page reference inside a footnote uses its target folio`,
    report.values.length > 0 && report.values.every((value) => value === report.target),
    JSON.stringify(report),
  )
}

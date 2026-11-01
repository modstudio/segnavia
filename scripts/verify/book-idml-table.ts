import type { Harness } from './harness.ts'
import { inspectPaginatedBlocks } from './paginated-blocks.ts'

export async function verifyImportedIdmlTable(h: Harness) {
  await h.page.goto(h.url('book-idml-table.html'))
  await h.page.waitForFunction(() => document.documentElement.hasAttribute('data-segnavia-composed'))
  const blocks = await h.page.evaluate(inspectPaginatedBlocks)
  h.check('an imported IDML table splits across pages and repeats its header', blocks.table.ok, blocks.table.detail)
  const rtl = await h.page.locator('[data-segnavia-galley-source] .idml-t-rtl td').evaluateAll((cells) => {
    const [first, second] = cells
    return {
      count: cells.length,
      first: first?.textContent?.trim(),
      second: second?.textContent?.trim(),
      ordered: Boolean(first && second && first.getBoundingClientRect().left > second.getBoundingClientRect().left),
    }
  })
  h.check(
    'an imported right-to-left IDML table keeps column order',
    rtl.count === 2 && rtl.first === 'RTL first' && rtl.second === 'RTL second' && rtl.ordered,
    JSON.stringify(rtl),
  )
}

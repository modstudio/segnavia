import type { Frame } from 'playwright-core'
import type { Harness } from './harness.ts'
import { inspectPaginatedBlocks, PAGINATED_TABLE_FLOW_IDS } from './paginated-blocks.ts'
import { compareHebrewInk } from './paginated-ink.ts'

export async function verifyPaginatedTableBook(h: Harness) {
  const id = 'book-paginated-tables-he'
  await h.page.goto(h.url('book-paginated-tables.html'))
  const element = await h.page.$(`#${id}`)
  const frame = await element?.contentFrame()
  if (!frame) throw new Error(`The paginated book frame ${id} did not load.`)
  await frame.waitForFunction(
    () => document.documentElement.hasAttribute('data-segnavia-composed') || document.documentElement.hasAttribute('data-segnavia-compose-failure'),
    undefined,
    { timeout: 20_000 },
  )
  const failure = await frame.evaluate(() => document.documentElement.getAttribute('data-segnavia-compose-failure'))
  h.check(`${id} composed without a planner refusal`, !failure, failure ?? 'composed')
  const blocks = await frame.evaluate(inspectPaginatedBlocks, {
    wrapped: PAGINATED_TABLE_FLOW_IDS.wrapped,
    margin: PAGINATED_TABLE_FLOW_IDS.margin,
  })
  h.check(`${id} a wrapped Markdown table repeats its header without losing rows`, blocks.wrappedTable.ok, blocks.wrappedTable.detail)
  h.check(`${id} a table with a top margin repeats its header at the top of the header band`, blocks.marginTable.ok, blocks.marginTable.detail)
  const ink = await compareHebrewInk(h, frame)
  h.check(`${id} no niqqud or taamim ink is lost at any window edge`, ink.ok, ink.detail)
  await h.page.goto(h.url('book-paginated.html'))
}

export async function verifyPaginatedBlocks(h: Harness, frame: Frame, id: string) {
  const blocks = await frame.evaluate(inspectPaginatedBlocks, { table: PAGINATED_TABLE_FLOW_IDS.table })
  h.check(`${id} each chapter's endnotes follow its text and come before the next chapter's opener or blank`, blocks.endnotes.ok, blocks.endnotes.detail)
  h.check(`${id} a tall image is scaled onto one page`, blocks.image.ok, blocks.image.detail)
  h.check(`${id} a long table continues with its header row repeated and no row lost or repeated`, blocks.table.ok, blocks.table.detail)
  if (id === 'book-paginated-he') h.check(`${id} the long table and endnotes are right to left`, blocks.direction.ok, blocks.direction.detail)
}

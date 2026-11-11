import type { Frame } from 'playwright-core'
import type { Harness } from './harness.ts'
import { inspectPaginatedBlocks, PAGINATED_TABLE_FLOW_IDS } from './paginated-blocks.ts'
import { compareHebrewInk } from './paginated-ink.ts'

export async function verifyPaginatedTableBook(h: Harness, frame: Frame) {
  const id = 'book-paginated-tables-he'
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
}

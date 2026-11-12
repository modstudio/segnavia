import { PREFLIGHT_ATTRIBUTE } from '@segnavia/frame/book-document'
import type { Harness } from './harness.ts'

async function settled(h: Harness, name: string) {
  await h.page.goto(h.url(name))
  await h.page.waitForFunction(
    () => document.documentElement.hasAttribute('data-segnavia-composed') || document.documentElement.hasAttribute('data-segnavia-compose-failure'),
  )
}

export async function verifyBookFill(h: Harness): Promise<void> {
  await settled(h, 'book-fill-repeat.html')
  const fill = await h.page.evaluate((attribute) => {
    const report = JSON.parse(document.documentElement.getAttribute(attribute) ?? 'null')
    const region = document.querySelector<HTMLElement>('[data-segnavia-book-page] [data-region="rows"]')
    const rows = Array.from(region?.querySelectorAll<HTMLElement>(':scope > [data-fill-index]') ?? [])
    const inkInside = rows.every((row) => {
      const range = document.createRange()
      range.selectNodeContents(row)
      const ink = range.getBoundingClientRect()
      const box = region?.getBoundingClientRect()
      return box !== undefined && ink.top >= box.top - 0.5 && ink.bottom <= box.bottom + 0.5
    })
    return { indexes: rows.map((row) => row.getAttribute('data-fill-index')), facts: report?.facts?.regions, inkInside }
  }, PREFLIGHT_ATTRIBUTE)
  h.check(
    'a pointed Hebrew practice row fills its region with indexed whole-ink copies and reports the count',
    fill.indexes.length > 1 &&
      fill.indexes.every((index: string | null, at: number) => index === String(at)) &&
      fill.inkInside &&
      fill.facts?.[0]?.fillCount === fill.indexes.length,
    JSON.stringify(fill),
  )

  await settled(h, 'book-fill-truncate.html')
  const truncated = await h.page.evaluate((attribute) => JSON.parse(document.documentElement.getAttribute(attribute) ?? 'null'), PREFLIGHT_ATTRIBUTE)
  const truncation = truncated?.facts?.regions?.find((region: { droppedTotal?: number }) => region.droppedTotal !== undefined)
  h.check(
    'truncate reports dropped pages and blocks, at most 50 ids, and the full total',
    truncation?.droppedPages === 1 && truncation?.droppedBlocks === 52 && truncation?.droppedIds?.length === 50 && truncation?.droppedTotal === 52,
    JSON.stringify(truncation),
  )

  await settled(h, 'book-fill-refuse.html')
  const refusal = await h.page.evaluate(() => document.documentElement.getAttribute('data-segnavia-compose-failure'))
  h.check(
    'refuse names the overflowing region, page and excess under the omitted default profile',
    refusal?.includes('Region practice:rows on page ') === true && refusal.includes('exceeds its block size by'),
    String(refusal),
  )
}

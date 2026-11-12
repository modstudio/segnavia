import { PREFLIGHT_ATTRIBUTE } from '@segnavia/frame/book-document'
import { truncatePointedText } from '../demo-book-fill-fixtures.ts'
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

  await settled(h, 'book-fill-truncate-pointed.html')
  const pointedTruncation = await h.page.evaluate(
    ({ attribute, authored }) => {
      const report = JSON.parse(document.documentElement.getAttribute(attribute) ?? 'null')
      const region = document.querySelector<HTMLElement>('[data-segnavia-book-page] [data-region="rows"]')
      const paragraph = region?.querySelector<HTMLElement>('[data-segnavia-id="pointed-lines"]')
      if (!region || !paragraph) return null
      const lineRects = (element: HTMLElement) => {
        const range = document.createRange()
        range.selectNodeContents(element)
        return Array.from(range.getClientRects())
      }
      const lineCount = (element: HTMLElement) => {
        const lines: number[] = []
        for (const rect of lineRects(element)) if (!lines.some((top) => Math.abs(top - rect.top) <= 0.5)) lines.push(rect.top)
        return lines.length
      }
      const authoredParagraph = paragraph.cloneNode(false) as HTMLElement
      authoredParagraph.textContent = authored
      authoredParagraph.style.position = 'fixed'
      authoredParagraph.style.visibility = 'hidden'
      authoredParagraph.style.inlineSize = `${region.getBoundingClientRect().width}px`
      authoredParagraph.style.inset = '0 auto auto 0'
      document.body.append(authoredParagraph)
      const authoredLines = lineCount(authoredParagraph)
      authoredParagraph.remove()
      const kept = paragraph.textContent ?? ''
      const keptLines = lineCount(paragraph)
      const segments = Array.from(new Intl.Segmenter('he', { granularity: 'grapheme' }).segment(authored))
      const boundaries = new Set([0, authored.length, ...segments.map((segment) => segment.index)])
      const keptSegments = Array.from(new Intl.Segmenter('he', { granularity: 'grapheme' }).segment(kept))
      const lastCodePoint = Array.from(kept).at(-1) ?? ''
      const box = region.getBoundingClientRect()
      const inkInside = lineRects(paragraph).every(
        (rect) => rect.top >= box.top - 0.5 && rect.bottom <= box.bottom + 0.5 && rect.left >= box.left - 0.5 && rect.right <= box.right + 0.5,
      )
      const fact = report?.facts?.regions?.find((candidate: { droppedIds?: string[] }) => candidate.droppedIds?.includes('pointed-lines'))
      return {
        authoredLines,
        keptLines,
        keptIsBoundaryPrefix: authored.startsWith(kept) && boundaries.has(kept.length),
        lastCodePointIsMark: /\p{M}/u.test(lastCodePoint),
        lastGrapheme: keptSegments.at(-1)?.segment ?? '',
        inkInside,
        factNamesBlock: fact !== undefined,
      }
    },
    { attribute: PREFLIGHT_ATTRIBUTE, authored: truncatePointedText },
  )
  h.check(
    'truncate cuts pointed Hebrew at a grapheme boundary and keeps every retained ink rect inside the region',
    pointedTruncation !== null &&
      pointedTruncation.keptLines > 0 &&
      pointedTruncation.keptLines < pointedTruncation.authoredLines &&
      pointedTruncation.keptIsBoundaryPrefix &&
      !pointedTruncation.lastCodePointIsMark &&
      pointedTruncation.inkInside &&
      pointedTruncation.factNamesBlock,
    JSON.stringify(pointedTruncation),
  )

  await settled(h, 'book-fill-refuse.html')
  const refusal = await h.page.evaluate(() => document.documentElement.getAttribute('data-segnavia-compose-failure'))
  h.check(
    'refuse names the overflowing region, page and excess under the omitted default profile',
    refusal?.includes('Region practice:rows on page ') === true && refusal.includes('exceeds its block size by'),
    String(refusal),
  )

  await settled(h, 'book-fill-parent-page.html')
  const parentFill = await h.page.evaluate((attribute) => {
    const report = JSON.parse(document.documentElement.getAttribute(attribute) ?? 'null')
    const region = document.querySelector<HTMLElement>('[data-segnavia-region="practice"]')
    const rows = Array.from(region?.querySelectorAll<HTMLElement>(':scope > [data-fill-index]') ?? [])
    const box = region?.getBoundingClientRect()
    const inkInside = rows.every((row) => {
      const range = document.createRange()
      range.selectNodeContents(row)
      const ink = range.getBoundingClientRect()
      return box !== undefined && ink.top >= box.top - 0.5 && ink.bottom <= box.bottom + 0.5
    })
    const fact = report?.facts?.regions?.find((candidate: { subject?: string }) => candidate.subject === 'practice-parent:practice')
    return { count: rows.length, fillCount: fact?.fillCount, inkInside }
  }, PREFLIGHT_ATTRIBUTE)
  h.check(
    'a parent-page region fills while attached, reports its count and keeps its ink',
    parentFill.count > 1 && parentFill.fillCount === parentFill.count && parentFill.inkInside,
    JSON.stringify(parentFill),
  )
}

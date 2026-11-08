import { describe, expect, test } from 'bun:test'
import {
  appendMeasuredBlock,
  composerScript,
  decideBookMeasurement,
  noteFragmentExtent,
  noteSettlementOverlapsBody,
  noteStackTops,
  pageReferenceFolio,
  unmeasuredFlows,
} from './composer.ts'

const facts = {
  hasLayout: true,
  flows: [{ id: 'chapter-1', sourceBlocks: 1, contentBlocks: 1, measuredLines: 1 }],
  plannedPages: 1,
  visibleElapsedMs: 0,
}

describe('decideBookMeasurement', () => {
  test('retries a galley without layout without charging visible time', () => {
    expect(decideBookMeasurement({ ...facts, hasLayout: false, visibleElapsedMs: 999 }, 1_000)).toBe('retry')
    expect(decideBookMeasurement({ ...facts, hasLayout: false, visibleElapsedMs: 1_000 }, 1_000)).toBe('retry')
  })

  test('retries deferred line measurement and page planning within the bound', () => {
    expect(
      decideBookMeasurement({ ...facts, flows: [{ id: 'chapter-1', sourceBlocks: 1, contentBlocks: 1, measuredLines: 0 }], visibleElapsedMs: 999 }, 1_000),
    ).toBe('retry')
    expect(decideBookMeasurement({ ...facts, plannedPages: 0, visibleElapsedMs: 999 }, 1_000)).toBe('retry')
  })

  test('composes measured or empty source content', () => {
    expect(decideBookMeasurement(facts, 1_000)).toBe('compose')
    expect(decideBookMeasurement({ ...facts, flows: [{ id: 'cover', sourceBlocks: 0, contentBlocks: 0, measuredLines: 0 }], plannedPages: 0 }, 1_000)).toBe(
      'compose',
    )
  })

  test('refuses deferred line measurement or page planning at the bound', () => {
    expect(
      decideBookMeasurement({ ...facts, flows: [{ id: 'chapter-1', sourceBlocks: 1, contentBlocks: 1, measuredLines: 0 }], visibleElapsedMs: 1_000 }, 1_000),
    ).toBe('refuse')
    expect(decideBookMeasurement({ ...facts, plannedPages: 0, visibleElapsedMs: 1_000 }, 1_000)).toBe('refuse')
  })

  test('defers while any source flow has no measured lines', () => {
    const flows = [
      { id: 'chapter-1', sourceBlocks: 2, contentBlocks: 2, measuredLines: 20 },
      { id: 'chapter-2', sourceBlocks: 3, contentBlocks: 3, measuredLines: 0 },
    ]
    expect(decideBookMeasurement({ ...facts, flows, visibleElapsedMs: 999 }, 1_000)).toBe('retry')
    expect(decideBookMeasurement({ ...facts, flows, visibleElapsedMs: 1_000 }, 1_000)).toBe('refuse')
  })

  test('composes when an empty source flow sits beside a measured flow', () => {
    const flows = [
      { id: 'chapter-1', sourceBlocks: 2, contentBlocks: 2, measuredLines: 20 },
      { id: 'chapter-2', sourceBlocks: 2, contentBlocks: 0, measuredLines: 0 },
    ]
    expect(decideBookMeasurement({ ...facts, flows, visibleElapsedMs: 1_000 }, 1_000)).toBe('compose')
  })

  test('composes a book whose only flows are empty', () => {
    const flows = [
      { id: 'chapter-1', sourceBlocks: 2, contentBlocks: 0, measuredLines: 0 },
      { id: 'chapter-2', sourceBlocks: 1, contentBlocks: 0, measuredLines: 0 },
    ]
    expect(decideBookMeasurement({ ...facts, flows, plannedPages: 0, visibleElapsedMs: 1_000 }, 1_000)).toBe('compose')
  })

  test('ignores fixed flows beside measured source flows', () => {
    const flows = [
      { id: 'cover', sourceBlocks: 0, contentBlocks: 0, measuredLines: 0 },
      { id: 'chapter-1', sourceBlocks: 2, contentBlocks: 2, measuredLines: 20 },
      { id: 'back-cover', sourceBlocks: 0, contentBlocks: 0, measuredLines: 0 },
    ]
    expect(decideBookMeasurement({ ...facts, flows }, 1_000)).toBe('compose')
  })
})

describe('block keeps', () => {
  test('a previous keep becomes a next keep on the preceding block of its flow', () => {
    const first = {}
    const held = { keepWithPrevious: true }
    const blocks: Array<{ keepWithNext?: boolean; keepWithPrevious?: boolean }> = [first]
    appendMeasuredBlock(blocks, held)
    expect(blocks).toEqual([{ keepWithNext: true }, {}])
  })

  test('composer reads standard and custom keeps in both directions', () => {
    const script = composerScript('{}')
    expect(script).toContain("style.breakAfter==='avoid'||style.pageBreakAfter==='avoid'||keepWith==='next'")
    expect(script).toContain("style.breakBefore==='avoid'||style.pageBreakBefore==='avoid'||keepWith==='previous'")
  })

  test('takes the page marker from config', () => {
    const script = composerScript('{"pageMarker":"data-segnavia-printed-page"}')
    expect(script).not.toContain('data-segnavia-book-page')
  })
})

test('lists exactly the unmeasured source flows in order', () => {
  expect(
    unmeasuredFlows([
      { id: 'cover', sourceBlocks: 0, contentBlocks: 0, measuredLines: 0 },
      { id: 'chapter-1', sourceBlocks: 2, contentBlocks: 2, measuredLines: 0 },
      { id: 'empty', sourceBlocks: 2, contentBlocks: 0, measuredLines: 0 },
      { id: 'chapter-2', sourceBlocks: 3, contentBlocks: 3, measuredLines: 12 },
      { id: 'chapter-3', sourceBlocks: 1, contentBlocks: 1, measuredLines: 0 },
    ]),
  ).toEqual(['chapter-1', 'chapter-3'])
})

test('derives a note fragment extent from its own settled line boxes', () => {
  const lines = [
    { top: 2, bottom: 24 },
    { top: 29, bottom: 51 },
    { top: 56, bottom: 78 },
  ]
  expect(noteFragmentExtent(lines, 0, 1)).toEqual({ start: 2, end: 26.5 })
  expect(noteFragmentExtent(lines, 1, 2)).toEqual({ start: 26.5, end: 53.5 })
  expect(noteFragmentExtent(lines, 1, 3)).toEqual({ start: 26.5, end: 78 })
  expect(noteFragmentExtent(lines, 3, 4)).toBeUndefined()
})

test('stacks settled note pieces from the bottom and refuses only a new body overlap', () => {
  const plannedTop = noteStackTops(600, [
    { gap: 10, height: 40 },
    { gap: 5, height: 45 },
  ])[0]
  const settledTop = noteStackTops(600, [
    { gap: 10, height: 60 },
    { gap: 5, height: 55 },
  ])[0]
  expect(plannedTop).toBe(510)
  expect(settledTop).toBe(480)
  expect(noteSettlementOverlapsBody(plannedTop ?? Number.NaN, settledTop ?? Number.NaN, 490)).toBeTrue()
  expect(noteSettlementOverlapsBody(settledTop ?? Number.NaN, settledTop ?? Number.NaN, 490)).toBeFalse()
  expect(noteSettlementOverlapsBody(500, 499.6, 510)).toBeFalse()
  expect(noteSettlementOverlapsBody(500, 480, 470)).toBeFalse()
})

test('refuses a page reference beyond the computed folios', () => {
  expect(
    pageReferenceFolio(
      'appendix',
      501,
      Array.from({ length: 500 }, (_, index) => ({ number: index + 1, text: String(index + 1) })),
    ),
  ).toEqual({
    refusal: 'page reference target appendix lands on page 501, beyond the 500 computed folios; shorten the book to 500 pages or fewer to clear this refusal',
  })
})
